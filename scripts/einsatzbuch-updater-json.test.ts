import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { baueLatestJson } from "./einsatzbuch-updater-json.mjs";

/*
 * Das Manifest, das der Updater der Desktop-App liest (`plugins.updater.endpoints` in
 * `apps/einsatzbuch/src-tauri/tauri.conf.json`). Der Workflow `einsatzbuch.yml` baut es aus
 * einem `einsatzbuch-vX.Y.Z`-Tag; hier wird geprüft, was er dort nicht mehr prüfen kann.
 */

// Zwei Signaturen, die wie der Inhalt einer `.sig`-Datei aussehen (Base64, ohne Zeilenende).
const SIG_MAC = "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKbWFj";
const SIG_WIN = "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKd2lu";

const eingabe = () => ({
  version: "1.2.3",
  notes: "Einsatzbuch 1.2.3",
  pubDate: new Date("2026-09-25T08:00:00Z"),
  repo: "rubenvitt/iuk-suite",
  tag: "einsatzbuch-v1.2.3",
  assets: {
    mac: { datei: "Einsatzbuch.app.tar.gz", signatur: SIG_MAC },
    windows: { datei: "Einsatzbuch_1.2.3_x64-setup.exe", signatur: SIG_WIN },
  },
});

const BASIS = "https://github.com/rubenvitt/iuk-suite/releases/download/einsatzbuch-v1.2.3";

describe("baueLatestJson — Tauri-2-Format", () => {
  it("liefert genau version, notes, pub_date und platforms", () => {
    expect(baueLatestJson(eingabe())).toEqual({
      version: "1.2.3",
      notes: "Einsatzbuch 1.2.3",
      pub_date: "2026-09-25T08:00:00.000Z",
      platforms: {
        "darwin-aarch64": { signature: SIG_MAC, url: `${BASIS}/Einsatzbuch.app.tar.gz` },
        "darwin-x86_64": { signature: SIG_MAC, url: `${BASIS}/Einsatzbuch.app.tar.gz` },
        "windows-x86_64": { signature: SIG_WIN, url: `${BASIS}/Einsatzbuch_1.2.3_x64-setup.exe` },
      },
    });
  });

  it("führt drei Plattformen; beide Mac-Architekturen zeigen auf das universelle Archiv", () => {
    const { platforms } = baueLatestJson(eingabe());
    expect(Object.keys(platforms).sort()).toEqual(["darwin-aarch64", "darwin-x86_64", "windows-x86_64"]);
    expect(platforms["darwin-aarch64"]).toEqual(platforms["darwin-x86_64"]);
  });

  it("kodiert Tag und Dateinamen für die URL", () => {
    const e = eingabe();
    e.tag = "einsatzbuch-v1.2.3+x";
    e.assets.windows.datei = "Einsatzbuch Größe#1.exe";
    const url = baueLatestJson(e).platforms["windows-x86_64"].url;
    expect(url).toBe(
      "https://github.com/rubenvitt/iuk-suite/releases/download/einsatzbuch-v1.2.3%2Bx/Einsatzbuch%20Gr%C3%B6%C3%9Fe%231.exe",
    );
  });

  it("nimmt ein Zeilenende am Signaturinhalt weg", () => {
    const e = eingabe();
    e.assets.mac.signatur = `${SIG_MAC}\n`;
    expect(baueLatestJson(e).platforms["darwin-aarch64"].signature).toBe(SIG_MAC);
  });

  it.each([
    ["fehlt", undefined],
    ["ist leer", ""],
    ["ist nur Leerraum", " \n"],
  ])("eine Signatur, die %s, ist ein Fehler", (_fall, signatur) => {
    const e = eingabe();
    (e.assets.windows as { signatur?: string }).signatur = signatur;
    expect(() => baueLatestJson(e)).toThrow(/Signatur.*windows/);
  });

  it("eine Signatur, die kein Base64 ist (etwa ein Pfad), ist ein Fehler", () => {
    const e = eingabe();
    e.assets.mac.signatur = "pakete/Einsatzbuch.app.tar.gz.sig";
    expect(() => baueLatestJson(e)).toThrow(/Signatur.*mac/);
  });

  it("ein Dateiname mit Verzeichnis ist ein Fehler, keine halbe URL", () => {
    const e = eingabe();
    e.assets.mac.datei = "pakete/Einsatzbuch.app.tar.gz";
    expect(() => baueLatestJson(e)).toThrow(/Dateiname/);
  });

  it("version trägt kein v-Präfix — und alles außer X.Y.Z ist ein Fehler", () => {
    expect(baueLatestJson(eingabe()).version).toBe("1.2.3");
    for (const falsch of ["v1.2.3", "einsatzbuch-v1.2.3", "1.2", "1.2.3-rc1", ""]) {
      const e = eingabe();
      e.version = falsch;
      expect(() => baueLatestJson(e), falsch).toThrow(/X\.Y\.Z/);
    }
  });

  it("pub_date ist RFC 3339, auch aus einer Zeichenkette", () => {
    const e = { ...eingabe(), pubDate: "2026-09-25T10:00:00+02:00" };
    expect(baueLatestJson(e).pub_date).toBe("2026-09-25T08:00:00.000Z");
    expect(() => baueLatestJson({ ...eingabe(), pubDate: "gestern" })).toThrow(/pubDate/);
  });

  it("ohne repo oder tag keine URL", () => {
    expect(() => baueLatestJson({ ...eingabe(), repo: "" })).toThrow(/repo/);
    expect(() => baueLatestJson({ ...eingabe(), repo: "nur-ein-teil" })).toThrow(/repo/);
    expect(() => baueLatestJson({ ...eingabe(), tag: "" })).toThrow(/tag/);
  });
});

describe("einsatzbuch-updater-json.mjs — Aufruf wie im Workflow", () => {
  const skript = path.join(__dirname, "einsatzbuch-updater-json.mjs");
  let ordner: string;
  const datei = (name: string, inhalt: string) => {
    const p = path.join(ordner, name);
    writeFileSync(p, inhalt);
    return p;
  };
  const argumente = () => [
    "--version",
    "1.2.3",
    "--tag",
    "einsatzbuch-v1.2.3",
    "--repo",
    "rubenvitt/iuk-suite",
    "--pub-date",
    "2026-09-25T08:00:00Z",
    "--mac-archiv",
    path.join(ordner, "Einsatzbuch.app.tar.gz"),
    "--mac-sig",
    path.join(ordner, "Einsatzbuch.app.tar.gz.sig"),
    "--win-installer",
    path.join(ordner, "Einsatzbuch_1.2.3_x64-setup.exe"),
    "--win-sig",
    path.join(ordner, "Einsatzbuch_1.2.3_x64-setup.exe.sig"),
  ];

  beforeAll(() => {
    ordner = mkdtempSync(path.join(tmpdir(), "iuk-updater-json-"));
    datei("Einsatzbuch.app.tar.gz", "archiv");
    datei("Einsatzbuch.app.tar.gz.sig", SIG_MAC);
    datei("Einsatzbuch_1.2.3_x64-setup.exe", "installer");
    datei("Einsatzbuch_1.2.3_x64-setup.exe.sig", SIG_WIN);
  });

  afterAll(() => {
    rmSync(ordner, { recursive: true, force: true });
  });

  it("schreibt nur das Manifest auf stdout, mit dem Inhalt der .sig-Dateien", () => {
    const aus = execFileSync(process.execPath, [skript, ...argumente()], { encoding: "utf8" });
    expect(JSON.parse(aus)).toEqual(baueLatestJson(eingabe()));
  });

  it("nimmt das Repo aus GITHUB_REPOSITORY, wenn --repo fehlt", () => {
    const ohneRepo = argumente().filter((_, i, a) => a[i] !== "--repo" && a[i - 1] !== "--repo");
    const aus = execFileSync(process.execPath, [skript, ...ohneRepo], {
      encoding: "utf8",
      env: { ...process.env, GITHUB_REPOSITORY: "someone/else" },
    });
    expect(JSON.parse(aus).platforms["darwin-aarch64"].url).toContain("github.com/someone/else/");
  });

  it("eine leere .sig-Datei bricht mit Meldung auf stderr ab, stdout bleibt leer", () => {
    const leer = datei("leer.sig", "");
    const a = argumente();
    a[a.indexOf("--win-sig") + 1] = leer;
    const lauf = spawnSync(process.execPath, [skript, ...a], { encoding: "utf8" });
    expect(lauf.status).not.toBe(0);
    expect(lauf.stdout).toBe("");
    expect(lauf.stderr).toMatch(/Signatur.*windows/);
  });

  it("eine fehlende .sig-Datei bricht ab", () => {
    const a = argumente();
    a[a.indexOf("--mac-sig") + 1] = path.join(ordner, "gibt-es-nicht.sig");
    const lauf = spawnSync(process.execPath, [skript, ...a], { encoding: "utf8" });
    expect(lauf.status).not.toBe(0);
    expect(lauf.stdout).toBe("");
    expect(lauf.stderr).toMatch(/gibt-es-nicht\.sig/);
  });

  it("ein fehlendes Paket bricht ab — das Manifest zeigte sonst ins Leere", () => {
    const a = argumente();
    a[a.indexOf("--win-installer") + 1] = path.join(ordner, "Einsatzbuch_9.9.9_x64-setup.exe");
    const lauf = spawnSync(process.execPath, [skript, ...a], { encoding: "utf8" });
    expect(lauf.status).not.toBe(0);
    expect(lauf.stdout).toBe("");
    expect(lauf.stderr).toMatch(/Paket nicht gefunden.*9\.9\.9/);
  });

  it("ein unbekanntes oder fehlendes Argument bricht ab", () => {
    const unbekannt = spawnSync(process.execPath, [skript, ...argumente(), "--latest", "ja"], {
      encoding: "utf8",
    });
    expect(unbekannt.status).not.toBe(0);
    const ohneTag = argumente().filter((_, i, a) => a[i] !== "--tag" && a[i - 1] !== "--tag");
    const lauf = spawnSync(process.execPath, [skript, ...ohneTag], { encoding: "utf8" });
    expect(lauf.status).not.toBe(0);
    expect(lauf.stderr).toMatch(/--tag/);
  });
});
