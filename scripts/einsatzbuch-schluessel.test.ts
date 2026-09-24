/**
 * Regressionssicherung für `einsatzbuch-schluessel.ts` (DRK-471):
 *
 *  - `verdeckt()` darf das Kennwort nie im Klartext ausgeben, auch nicht bei einer Korrektur
 *    (Rücktaste) mitten in der Eingabe.
 *  - `verdeckt()` lehnt bei Strg-C oder Eingabeende mit `Abgebrochen` ab, statt offen zu bleiben.
 *  - `main()` darf nie eine `schluesselpaar`-Zeile anlegen, bevor die Notfall-Sicherung sicher
 *    auf der Platte liegt — weder bei einem Aufruffehler (`--ausgabe` ohne Wert) noch bei einem
 *    Schreibfehler nach der Schlüsselerzeugung.
 *  - Scheitert das Speichern nach dem Schreiben, verschwinden die beiden Dateien wieder.
 *  - Ein noch nicht vorhandener `--ausgabe`-Ordner entsteht selbst (rekursiv, Modus 0700),
 *    statt den Aufruf mit ENOENT abzubrechen.
 *  - Der Entwicklungs-KEK aus dem Repo taugt nicht für das echte Paar.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough, Writable } from "node:stream";
import { sql } from "drizzle-orm";
import { schluesselpaar } from "@/app/m/einsatzbuch/_db/schema";
import { testDb, type TestDb } from "@/app/m/einsatzbuch/_lib/testDb";
import { ENTWICKLUNGS_KEK } from "@/app/m/einsatzbuch/_lib/schluessel/kek";
import { erzeugeNotfalldatei } from "@/app/m/einsatzbuch/_lib/schluessel/notfall";
import { legePaarAn } from "@/app/m/einsatzbuch/_lib/schluessel/paar";
import { main, verdeckt, type SkriptEA } from "./einsatzbuch-schluessel";

const KEK_BASE64 = Buffer.alloc(32, 7).toString("base64");
const NOTFALL_KENNWORT = "ein-notfallkennwort-fuer-tests";

const zaehlerSchluesselpaar = (db: TestDb): number =>
  (db.all(sql.raw("SELECT count(*) AS n FROM schluesselpaar")) as { n: number }[])[0].n;

/** Sammelt alles, was auf den Stream geschrieben wird. */
function mitschrift(): { stream: Writable; text: () => string } {
  const teile: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _enc, ok) {
      teile.push(chunk.toString("utf8"));
      ok();
    },
  });
  return { stream, text: () => teile.join("") };
}

/** Setzt eine Umgebungsvariable zurück; `process.env.X = undefined` ergäbe den Text "undefined". */
function stelleZurueck(name: string, wert: string | undefined): void {
  if (wert === undefined) delete process.env[name];
  else process.env[name] = wert;
}

describe("verdeckt: kein Kennwort-Leck bei einer Korrektur (DRK-471)", () => {
  it("Rücktaste (\\x7f) mitten in der Eingabe erscheint nie auf der Ausgabe", async () => {
    const input = new PassThrough();
    const geschrieben: string[] = [];
    const output = new Writable({
      write(chunk: Buffer, _enc, ok) {
        geschrieben.push(chunk.toString("utf8"));
        ok();
      },
    });

    const eingabe = verdeckt("Notfall-Kennwort: ", input, output);
    // Probe: "geheim-kennwort-12X⌫3⏎" → Kennwort "geheim-kennwort-123".
    input.write("geheim-kennwort-12X");
    input.write("\x7f"); // Rücktaste: löscht das "X"
    input.write("3");
    input.write("\n");

    expect(await eingabe).toBe("geheim-kennwort-123");
    const ausgabe = geschrieben.join("");
    // Weder der Zwischenstand vor der Korrektur noch das fertige Kennwort dürfen je
    // geschrieben worden sein — nur die Frage selbst und der abschließende Zeilenumbruch.
    expect(ausgabe).not.toContain("geheim-kennwort-12");
    expect(ausgabe).not.toContain("geheim-kennwort-123");
    expect(ausgabe).toBe("Notfall-Kennwort: \n");
  });

  it.each([
    ["Strg-C (\\x03)", (input: PassThrough) => input.write("geheim\x03")],
    ["Eingabeende (Strg-D bzw. geschlossener Stream)", (input: PassThrough) => input.end()],
  ])("%s lehnt mit „Abgebrochen“ ab, statt offen zu bleiben", async (_name, abbrechen) => {
    const input = new PassThrough();
    const aus = mitschrift();
    const eingabe = verdeckt("Notfall-Kennwort: ", input, aus.stream);
    abbrechen(input);
    await expect(eingabe).rejects.toThrow("Abgebrochen");
    expect(aus.text()).not.toContain("geheim");
  });
});

describe("main erzeugen: Sicherung entsteht vor der DB-Zeile (DRK-471)", () => {
  let vorherKek: string | undefined;
  let vorherKennwort: string | undefined;
  const wegwerfOrdner: string[] = [];

  beforeEach(() => {
    vorherKek = process.env.EINSATZBUCH_SCHLUESSEL_KEK;
    vorherKennwort = process.env.EINSATZBUCH_NOTFALL_KENNWORT;
    process.env.EINSATZBUCH_SCHLUESSEL_KEK = KEK_BASE64;
    process.env.EINSATZBUCH_NOTFALL_KENNWORT = NOTFALL_KENNWORT;
  });

  afterEach(() => {
    stelleZurueck("EINSATZBUCH_SCHLUESSEL_KEK", vorherKek);
    stelleZurueck("EINSATZBUCH_NOTFALL_KENNWORT", vorherKennwort);
    vi.restoreAllMocks();
    for (const o of wegwerfOrdner.splice(0)) rmSync(o, { recursive: true, force: true });
  });

  it("(a) Schreibfehler NACH der Schlüsselerzeugung: Exit 1, keine Zeile in schluesselpaar, keine Datei", async () => {
    const db = testDb();
    const ordner = mkdtempSync(path.join(tmpdir(), "eb-schluessel-schreibfehler-"));
    wegwerfOrdner.push(ordner);
    const fehler = vi.spyOn(console, "error").mockImplementation(() => {});
    // Der Schreiber wird erst nach `bereiteEchtesPaarVor` gerufen — dass er gerufen wurde,
    // belegt, dass das Scheitern hinter der Schlüsselerzeugung liegt (nicht schon bei mkdir).
    const schreibe = vi.fn<NonNullable<SkriptEA["schreibe"]>>(() => {
      throw Object.assign(new Error("ENOSPC: no space left on device"), { code: "ENOSPC" });
    });

    const exit = await main(["erzeugen", "--ausgabe", ordner], db, { schreibe });

    expect(exit).toBe(1);
    expect(schreibe).toHaveBeenCalledTimes(1);
    expect(zaehlerSchluesselpaar(db)).toBe(0);
    expect(readdirSync(ordner)).toEqual([]);
    expect(fehler.mock.calls.flat().join("\n")).toContain("Es wurde kein Schlüsselpaar angelegt.");
  });

  it("(a2) Ausgabeordner ist eine Datei: Exit 2 vor dem Kennwortdialog, keine Zeile in schluesselpaar", async () => {
    const db = testDb();
    const wurzel = mkdtempSync(path.join(tmpdir(), "eb-schluessel-blockiert-"));
    wegwerfOrdner.push(wurzel);
    // Eine DATEI an der Stelle, an der `main()` einen Ordner erwartet: `mkdirSync` scheitert,
    // unabhängig von Zugriffsrechten (auch als root).
    const blockiert = path.join(wurzel, "blockiert-als-datei");
    writeFileSync(blockiert, "");
    delete process.env.EINSATZBUCH_NOTFALL_KENNWORT;
    const aus = mitschrift();
    const fehler = vi.spyOn(console, "error").mockImplementation(() => {});

    const exit = await main(["erzeugen", "--ausgabe", blockiert], db, { eingabe: new PassThrough(), ausgabe: aus.stream });

    expect(exit).toBe(2);
    expect(aus.text()).toBe(""); // kein Kennwortdialog
    expect(zaehlerSchluesselpaar(db)).toBe(0);
    expect(fehler.mock.calls.flat().join("\n")).toContain("lässt sich nicht anlegen");
  });

  it("(b) --ausgabe ohne Wert: Exit 2 und keine Zeile in schluesselpaar", async () => {
    const db = testDb();

    const exit = await main(["erzeugen", "--ausgabe"], db);

    expect(exit).toBe(2);
    expect(zaehlerSchluesselpaar(db)).toBe(0);
  });

  it("(c) Erfolg: genau eine Zeile, beide Dateien mit Modus 0600", async () => {
    const db = testDb();
    const ordner = mkdtempSync(path.join(tmpdir(), "eb-schluessel-ok-"));
    wegwerfOrdner.push(ordner);

    const exit = await main(["erzeugen", "--ausgabe", ordner], db);

    expect(exit).toBe(0);
    expect(zaehlerSchluesselpaar(db)).toBe(1);
    const dateien = readdirSync(ordner);
    const json = dateien.find((d) => d.endsWith(".json"));
    const html = dateien.find((d) => d.endsWith(".html"));
    expect(json).toBeDefined();
    expect(html).toBeDefined();
    expect(statSync(path.join(ordner, json!)).mode & 0o777).toBe(0o600);
    expect(statSync(path.join(ordner, html!)).mode & 0o777).toBe(0o600);
  });

  it("(d) --ausgabe zeigt auf einen noch nicht vorhandenen (verschachtelten) Ordner: main() legt ihn selbst an, Modus 0700", async () => {
    const db = testDb();
    const wurzel = mkdtempSync(path.join(tmpdir(), "eb-schluessel-anlegen-"));
    wegwerfOrdner.push(wurzel);
    const ordner = path.join(wurzel, "noch-nicht-da", "verschachtelt");

    const exit = await main(["erzeugen", "--ausgabe", ordner], db);

    expect(exit).toBe(0);
    expect(zaehlerSchluesselpaar(db)).toBe(1);
    const info = statSync(ordner);
    expect(info.isDirectory()).toBe(true);
    expect(info.mode & 0o777).toBe(0o700);
  });

  it("(e) Speichern scheitert nach dem Schreiben: beide Dateien verworfen, Meldung nennt es", async () => {
    const db = testDb();
    const ordner = mkdtempSync(path.join(tmpdir(), "eb-schluessel-verworfen-"));
    wegwerfOrdner.push(ordner);
    const fehler = vi.spyOn(console, "error").mockImplementation(() => {});
    // Ein paralleler Aufruf legt zwischen Schreiben und Speichern ein echtes Paar an:
    // `speichere()` prüft erneut und wirft `EchtesPaarVorhanden`. Die fremde Zeile entsteht
    // vorab in einer zweiten DB und wird im zweiten Schreibaufruf synchron eingefügt.
    const kek = new Uint8Array(Buffer.from(KEK_BASE64, "base64"));
    const nebenan = testDb();
    await legePaarAn(nebenan, { art: "echt", rechnerId: null, kek, jetzt: new Date(0) });
    const fremdeZeile = nebenan.select().from(schluesselpaar).get()!;
    let aufrufe = 0;
    const schreibe: NonNullable<SkriptEA["schreibe"]> = (datei, inhalt, optionen) => {
      writeFileSync(datei, inhalt, optionen);
      if (++aufrufe === 2) db.insert(schluesselpaar).values(fremdeZeile).run();
    };

    const exit = await main(["erzeugen", "--ausgabe", ordner], db, { schreibe });

    expect(exit).toBe(1);
    expect(zaehlerSchluesselpaar(db)).toBe(1); // nur das parallel angelegte
    expect(readdirSync(ordner).filter((d) => d.startsWith("einsatzbuch-notfall-"))).toEqual([]);
    expect(fehler.mock.calls.flat().join("\n")).toContain("Notfall-Sicherung verworfen, weil das Paar nicht gespeichert wurde.");
  });

  it("(f) vorhandenes echtes Paar: Abbruch VOR dem Kennwortdialog mit der bekannten Meldung", async () => {
    const db = testDb();
    const kek = new Uint8Array(Buffer.from(KEK_BASE64, "base64"));
    const vorhanden = await legePaarAn(db, { art: "echt", rechnerId: null, kek, jetzt: new Date(0) });
    delete process.env.EINSATZBUCH_NOTFALL_KENNWORT;
    const ordner = mkdtempSync(path.join(tmpdir(), "eb-schluessel-vorhanden-"));
    wegwerfOrdner.push(ordner);
    const aus = mitschrift();
    const fehler = vi.spyOn(console, "error").mockImplementation(() => {});

    const exit = await main(["erzeugen", "--ausgabe", ordner], db, { eingabe: new PassThrough(), ausgabe: aus.stream });

    expect(exit).not.toBe(0);
    expect(aus.text()).toBe(""); // kein „Notfall-Kennwort:“
    expect(fehler.mock.calls.flat().join("\n")).toContain(`Es gibt schon ein echtes Schlüsselpaar (${vorhanden.schluesselId})`);
    expect(zaehlerSchluesselpaar(db)).toBe(1);
  });

  it("(g) Strg-C im Kennwortdialog: Exit ≠ 0, keine Zeile, keine Datei", async () => {
    const db = testDb();
    delete process.env.EINSATZBUCH_NOTFALL_KENNWORT;
    const ordner = mkdtempSync(path.join(tmpdir(), "eb-schluessel-abbruch-"));
    wegwerfOrdner.push(ordner);
    const eingabe = new PassThrough();
    const aus = mitschrift();
    vi.spyOn(console, "error").mockImplementation(() => {});

    const lauf = main(["erzeugen", "--ausgabe", ordner], db, { eingabe, ausgabe: aus.stream });
    await vi.waitFor(() => expect(aus.text()).toContain("Notfall-Kennwort: "));
    eingabe.write("halb-getippt\x03");

    expect(await lauf).not.toBe(0);
    expect(zaehlerSchluesselpaar(db)).toBe(0);
    expect(readdirSync(ordner)).toEqual([]);
  });
});

describe("main: der Entwicklungs-KEK taugt nicht für das echte Paar", () => {
  let vorherKek: string | undefined;
  let vorherKennwort: string | undefined;
  const wegwerfOrdner: string[] = [];

  beforeEach(() => {
    vorherKek = process.env.EINSATZBUCH_SCHLUESSEL_KEK;
    vorherKennwort = process.env.EINSATZBUCH_NOTFALL_KENNWORT;
    process.env.EINSATZBUCH_SCHLUESSEL_KEK = ENTWICKLUNGS_KEK;
    process.env.EINSATZBUCH_NOTFALL_KENNWORT = NOTFALL_KENNWORT;
  });

  afterEach(() => {
    stelleZurueck("EINSATZBUCH_SCHLUESSEL_KEK", vorherKek);
    stelleZurueck("EINSATZBUCH_NOTFALL_KENNWORT", vorherKennwort);
    vi.restoreAllMocks();
    for (const o of wegwerfOrdner.splice(0)) rmSync(o, { recursive: true, force: true });
  });

  it("erzeugen: Exit 2, deutsche Meldung, keine Zeile, keine Datei", async () => {
    const db = testDb();
    const ordner = mkdtempSync(path.join(tmpdir(), "eb-schluessel-entwicklung-"));
    wegwerfOrdner.push(ordner);
    const fehler = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await main(["erzeugen", "--ausgabe", ordner], db)).toBe(2);
    expect(fehler.mock.calls.flat().join("\n")).toContain("ist der Entwicklungs-KEK aus dem Repo");
    expect(zaehlerSchluesselpaar(db)).toBe(0);
    expect(readdirSync(ordner)).toEqual([]);
  });

  it("wiederherstellen: Exit 2, deutsche Meldung, keine Zeile", async () => {
    const db = testDb();
    const ordner = mkdtempSync(path.join(tmpdir(), "eb-schluessel-entwicklung-"));
    wegwerfOrdner.push(ordner);
    const datei = path.join(ordner, "notfall.json");
    // Eine gültige Sicherung: die Ablehnung darf nicht an der Datei hängen, nur am KEK.
    const notfall = await erzeugeNotfalldatei(new Uint8Array(48).fill(1), { schluesselId: "0123456789abcdef", oeffentlich: "AAAA", erstellt: "2026-09-24T10:00:00+02:00" }, NOTFALL_KENNWORT);
    writeFileSync(datei, JSON.stringify(notfall));
    const fehler = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await main(["wiederherstellen", datei], db)).toBe(2);
    expect(fehler.mock.calls.flat().join("\n")).toContain("ist der Entwicklungs-KEK aus dem Repo");
    expect(zaehlerSchluesselpaar(db)).toBe(0);
    expect(existsSync(datei)).toBe(true);
  });
});
