import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, openSync, readFileSync, readSync, closeSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Der Wächter für eine Naht, die KEIN anderes Tor sieht — Geschwister von
 * `src/docker-kontext.test.ts`, dieselbe Frage aus der anderen Richtung: dort
 * „liegt das Importziel im Kontext?", hier „ist die Datei im Kontext auch die
 * Datei, für die man sie hält?".
 *
 * Die statischen Medien unter `public/` liegen in Git LFS (`.gitattributes`:
 * `*.webp`, `*.jpg`, `*.jpeg`, `*.png`). Ein Arbeitsbaum ohne geholte
 * LFS-Objekte enthält an ihrer Stelle eine ~130 Byte grosse TEXTdatei:
 *
 *     version https://git-lfs.github.com/spec/v1
 *     oid sha256:cc98c69c…
 *     size 7794
 *
 * DAS IST AUF JEDER STUFE STILL. Die Datei existiert, sie hat die richtige
 * Endung, `existsSync` sagt ja, `pnpm build` baut grün, das Docker-Image startet,
 * und der Server liefert sie mit HTTP 200 und `content-type: image/webp` aus.
 * Erst der Browser stolpert — und zeigt ein kaputtes Bildsymbol, ohne dass
 * irgendwo eine Fehlerzeile entsteht. Genau so ausgeliefert am 29.08.2026: alle
 * 25 Illustrationen des Drohnentrainings und der Anmeldehintergrund
 * (`public/login-bg.jpg`) waren im Produktions-Image Zeigerdateien, weil
 * `actions/checkout` LFS-Objekte per Vorgabe NICHT holt (`lfs: false`) und
 * `COPY . .` im Dockerfile nimmt, was im Arbeitsbaum liegt.
 *
 * Warum die Prüfung auf die BYTES geht und nicht auf die Grösse: eine Zeigerdatei
 * ist zwar klein, aber ein legitimes 130-Byte-Icon wäre es auch. Die Signatur ist
 * eindeutig, die Grösse ist es nicht.
 *
 * Wird dieser Test rot, ist fast nie eine Datei kaputt — es fehlen die
 * LFS-Objekte. Die Fehlermeldung nennt den Weg heraus.
 */

const WURZEL = resolve(__dirname, "..");

/** Erste Zeile jeder LFS-Zeigerdatei; die Version ist Teil des Formats (git-lfs spec/v1). */
const ZEIGER_KOPF = "version https://git-lfs.github.com/spec/v1";

/**
 * Die `filter=lfs`-Muster aus `.gitattributes` — nicht fest verdrahtet, damit ein
 * neuer Medientyp (`*.svg`, `*.mp4`) hier von selbst mitgeprüft wird, statt eine
 * zweite Wahrheit zu erzeugen, die still altert.
 *
 * Bewusst nur der einfache Fall `*.<endung>`: alles andere (Pfadmuster,
 * Verzeichnisse) bildet dieser Leser nicht ab und soll laut hier stehenbleiben
 * statt eine Zusicherung zu erben, die er nicht mehr geben kann.
 */
function lfsEndungen(): string[] {
  const datei = join(WURZEL, ".gitattributes");
  expect(existsSync(datei), ".gitattributes fehlt — ohne sie prüft dieser Test nichts").toBe(true);

  const zeilen = readFileSync(datei, "utf8")
    .split("\n")
    .map((z) => z.trim())
    .filter((z) => z !== "" && !z.startsWith("#") && z.includes("filter=lfs"));

  return zeilen.map((zeile) => {
    const muster = zeile.split(/\s+/)[0];
    if (!/^\*\.[A-Za-z0-9]+$/.test(muster)) {
      throw new Error(
        `.gitattributes-Muster "${muster}" bildet dieser Wächter nicht ab — ` +
          `entweder das Muster als "*.<endung>" schreiben oder lfsEndungen() erweitern.`,
      );
    }
    return muster.slice(1).toLowerCase();
  });
}

/** Getrackte Dateien mit einer der LFS-Endungen. `git ls-files` sieht auch, was `.gitignore` verdeckt. */
function lfsDateien(endungen: string[]): string[] {
  return execFileSync("git", ["ls-files", "-z"], { cwd: WURZEL, encoding: "utf8" })
    .split("\0")
    .filter(Boolean)
    .filter((pfad) => endungen.some((endung) => pfad.toLowerCase().endsWith(endung)));
}

/** Nur der Kopf, nicht die ganze Datei — `login-bg.jpg` allein ist 613 KB gross. */
function kopf(pfad: string, bytes: number): Buffer {
  const puffer = Buffer.alloc(bytes);
  const fd = openSync(pfad, "r");
  try {
    const gelesen = readSync(fd, puffer, 0, bytes, 0);
    return puffer.subarray(0, gelesen);
  } finally {
    closeSync(fd);
  }
}

describe("Medien in Git LFS", () => {
  const endungen = lfsEndungen();
  const dateien = lfsDateien(endungen);

  it("kennt die heutigen Muster (sonst prüft der Rest ins Leere)", () => {
    expect(endungen).toContain(".webp");
    expect(endungen).toContain(".jpg");
    // Gegenprobe: es gibt überhaupt Dateien, auf die die Muster passen.
    expect(dateien.length).toBeGreaterThan(0);
    expect(dateien).toContain("public/m/uav/illustrations/1-1.webp");
    expect(dateien).toContain("public/login-bg.jpg");
  });

  it("keine Datei ist eine LFS-Zeigerdatei statt des Bildes", () => {
    const zeiger = dateien.filter((pfad) =>
      kopf(join(WURZEL, pfad), ZEIGER_KOPF.length).toString("utf8") === ZEIGER_KOPF,
    );

    expect(
      zeiger,
      `${zeiger.length} Datei(en) sind LFS-Zeiger statt Bilder — der Arbeitsbaum hat die ` +
        `LFS-Objekte nicht:\n${zeiger.join("\n")}\n\n` +
        `Lokal beheben: "git lfs install && git lfs pull".\n` +
        `In der CI beheben: "lfs: true" am actions/checkout des betroffenen Jobs ` +
        `(.github/workflows/ci.yml).`,
    ).toEqual([]);
  });

  it("die Illustrationen des Drohnentrainings sind echte WebP-Dateien", () => {
    // WebP ist ein RIFF-Container: Byte 0-3 „RIFF", Byte 8-11 „WEBP". Die zweite
    // Prüfung ist nicht doppelt gemoppelt zur ersten: sie fängt auch die andere
    // Richtung — eine als .webp abgelegte Datei, die keine ist.
    const webp = dateien.filter((pfad) => pfad.startsWith("public/m/uav/illustrations/"));
    expect(webp.length).toBeGreaterThan(0);

    const falsch = webp.filter((pfad) => {
      const b = kopf(join(WURZEL, pfad), 12);
      return b.length < 12 || b.subarray(0, 4).toString("latin1") !== "RIFF" || b.subarray(8, 12).toString("latin1") !== "WEBP";
    });

    expect(falsch, `keine gültige WebP-Signatur:\n${falsch.join("\n")}`).toEqual([]);
  });
});
