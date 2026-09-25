import { describe, expect, it } from "vitest";
import { einmalcode } from "../../_db/schema";
import { testDb } from "../testDb";
import { CODE_GUELTIG_MS, erzeugeCode, loeseEin } from "./einmalcode";
import { hashVon, neuesGeheimnis, s256 } from "./token";

const JETZT = new Date("2026-09-25T08:00:00Z");
const nach = (ms: number) => new Date(JETZT.getTime() + ms);

function vorbereiten(einrichtung: Parameters<typeof erzeugeCode>[1]["einrichtung"] = null) {
  const db = testDb();
  const verifier = neuesGeheimnis() + neuesGeheimnis();
  const code = erzeugeCode(db, { challenge: s256(verifier), sub: "sub-1", name: "Jana Albers", jetzt: JETZT, einrichtung });
  return { db, verifier, code };
}

describe("erzeugeCode / loeseEin", () => {
  it("gilt 60 Sekunden", () => {
    expect(CODE_GUELTIG_MS).toBe(60_000);
  });

  it("löst mit dem richtigen Verifier genau einmal ein, das zweite Einlösen ist code_ungueltig", () => {
    const { db, verifier, code } = vorbereiten();
    expect(loeseEin(db, code, verifier, nach(1_000))).toEqual({ ok: true, sub: "sub-1", name: "Jana Albers", einrichtung: null });
    expect(loeseEin(db, code, verifier, nach(2_000))).toEqual({ ok: false, code: "code_ungueltig" });
  });

  it("reicht die Einrichtung durch", () => {
    const { db, verifier, code } = vorbereiten({ art: "echt", name: "Einsatzleitung", ersetzen: true });
    expect(loeseEin(db, code, verifier, JETZT)).toEqual({
      ok: true, sub: "sub-1", name: "Jana Albers", einrichtung: { art: "echt", name: "Einsatzleitung", ersetzen: true },
    });
  });

  it("ist nach 60 001 ms code_ungueltig", () => {
    const { db, verifier, code } = vorbereiten();
    expect(loeseEin(db, code, verifier, nach(60_001))).toEqual({ ok: false, code: "code_ungueltig" });
  });

  it("gilt knapp vor Ablauf noch", () => {
    const { db, verifier, code } = vorbereiten();
    expect(loeseEin(db, code, verifier, nach(59_000))).toMatchObject({ ok: true });
  });

  it("ein falscher Verifier ist verifier_falsch und verbraucht den Code: danach ist auch der richtige code_ungueltig", () => {
    const { db, verifier, code } = vorbereiten();
    expect(loeseEin(db, code, neuesGeheimnis() + neuesGeheimnis(), JETZT)).toEqual({ ok: false, code: "verifier_falsch" });
    expect(loeseEin(db, code, verifier, JETZT)).toEqual({ ok: false, code: "code_ungueltig" });
  });

  it("ein nie ausgegebener Code ist code_ungueltig", () => {
    const { db, verifier } = vorbereiten();
    expect(loeseEin(db, neuesGeheimnis(), verifier, JETZT)).toEqual({ ok: false, code: "code_ungueltig" });
  });

  it("zwei Einlösungen desselben Codes kurz hintereinander ergeben genau ein ok", async () => {
    const { db, verifier, code } = vorbereiten();
    const ergebnisse = await Promise.all([
      Promise.resolve().then(() => loeseEin(db, code, verifier, JETZT)),
      Promise.resolve().then(() => loeseEin(db, code, verifier, JETZT)),
    ]);
    expect(ergebnisse.filter((e) => e.ok)).toHaveLength(1);
    expect(ergebnisse.filter((e) => !e.ok)).toEqual([{ ok: false, code: "code_ungueltig" }]);
  });

  it("speichert nur den Hash, nie den Klartext", () => {
    const { db, code } = vorbereiten({ art: "test", name: "Übungsrechner", ersetzen: false });
    const zeilen = db.select().from(einmalcode).all();
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0].codeHash).toBe(hashVon(code));
    expect(JSON.stringify(zeilen)).not.toContain(code);
    expect(zeilen[0]).toMatchObject({ einrichtungArt: "test", rechnerName: "Übungsrechner", ersetzen: false, eingeloestAm: null });
  });
});
