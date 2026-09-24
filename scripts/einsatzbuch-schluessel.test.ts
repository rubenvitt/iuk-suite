/**
 * Regressionssicherung für Fix-Runde 1 (DRK-471) an `einsatzbuch-schluessel.ts`:
 *
 *  - Befund 1: `verdeckt()` durfte das Kennwort nie im Klartext ausgeben, auch nicht bei
 *    einer Korrektur (Rücktaste) mitten in der Eingabe.
 *  - Befund 2: `main()` durfte nie eine `schluesselpaar`-Zeile anlegen, bevor die
 *    Notfall-Sicherung sicher auf der Platte liegt — weder bei einem Aufruffehler
 *    (`--ausgabe` ohne Wert) noch bei einem Schreibfehler (Ordner nicht beschreibbar).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough, Writable } from "node:stream";
import { sql } from "drizzle-orm";
import { testDb, type TestDb } from "@/app/m/einsatzbuch/_lib/testDb";
import { main, verdeckt } from "./einsatzbuch-schluessel";

const KEK_BASE64 = Buffer.alloc(32, 7).toString("base64");
const NOTFALL_KENNWORT = "ein-notfallkennwort-fuer-tests";

const zaehlerSchluesselpaar = (db: TestDb): number =>
  (db.all(sql.raw("SELECT count(*) AS n FROM schluesselpaar")) as { n: number }[])[0].n;

describe("verdeckt: kein Kennwort-Leck bei einer Korrektur (Befund 1, DRK-471)", () => {
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
    // Probe aus dem Befund: "geheim-kennwort-12X⌫3⏎" → Kennwort "geheim-kennwort-123".
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
});

describe("main erzeugen: Sicherung entsteht vor der DB-Zeile (Befund 2, DRK-471)", () => {
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
    process.env.EINSATZBUCH_SCHLUESSEL_KEK = vorherKek;
    process.env.EINSATZBUCH_NOTFALL_KENNWORT = vorherKennwort;
    for (const o of wegwerfOrdner.splice(0)) rmSync(o, { recursive: true, force: true });
  });

  it("(a) nicht beschreibbarer Ausgabeordner: main() lehnt ab (Exit ≠ 0 am CLI-Einstieg), keine Zeile in schluesselpaar", async () => {
    const db = testDb();
    const wurzel = mkdtempSync(path.join(tmpdir(), "eb-schluessel-blockiert-"));
    wegwerfOrdner.push(wurzel);
    // Eine DATEI an der Stelle, an der `main()` einen Ordner erwartet: `writeFileSync`
    // scheitert mit ENOTDIR, unabhängig von Zugriffsrechten (auch als root).
    const blockiert = path.join(wurzel, "blockiert-als-datei");
    writeFileSync(blockiert, "");

    // Der Schreibfehler (ENOTDIR) verlässt `main()` als Ablehnung — wie im echten CLI-Einstieg
    // (`main(...).then(..., onRejected)`), der daraus Exit 1 macht, statt den Fehler zu
    // verschlucken.
    await expect(main(["erzeugen", "--ausgabe", blockiert], db)).rejects.toThrow();
    expect(zaehlerSchluesselpaar(db)).toBe(0);
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
});
