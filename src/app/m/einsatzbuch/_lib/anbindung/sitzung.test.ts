import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { rechner, sitzung } from "../../_db/schema";
import { testDb } from "../testDb";
import { erzeugeSitzung, SITZUNG_GUELTIG_MS, sitzungAus } from "./sitzung";
import { hashVon } from "./token";

const JETZT = new Date("2026-09-25T08:00:00Z");
const nach = (ms: number) => new Date(JETZT.getTime() + ms);

function mitRechner() {
  const db = testDb();
  db.insert(rechner).values({
    id: "r1", art: "test", name: "Übungsrechner", tokenHash: "hash-r1",
    eingerichtetAm: JETZT, eingerichtetVon: "Jana Albers", eingerichtetVonSub: "sub-1",
  }).run();
  return db;
}

describe("erzeugeSitzung / sitzungAus", () => {
  it("gilt 30 Minuten", () => {
    expect(SITZUNG_GUELTIG_MS).toBe(30 * 60_000);
  });

  it("liefert Token und Ablauf; gespeichert ist nur der Hash", () => {
    const db = testDb();
    const { token, ablauf } = erzeugeSitzung(db, {
      sub: "sub-1", name: "Jana Albers", rechnerId: null, einrichtung: { art: "test", name: "Übungsrechner", ersetzen: false }, jetzt: JETZT,
    });
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(ablauf).toEqual(nach(SITZUNG_GUELTIG_MS));
    const zeilen = db.select().from(sitzung).all();
    expect(zeilen).toEqual([{
      tokenHash: hashVon(token), sub: "sub-1", name: "Jana Albers", ablauf, rechnerId: null,
      einrichtungArt: "test", rechnerName: "Übungsrechner", ersetzen: false, eingerichtet: false,
    }]);
    expect(JSON.stringify(zeilen)).not.toContain(token);
    expect(sitzungAus(db, token, nach(1_000))).toEqual(zeilen[0]);
  });

  it("gilt nach 30 Minuten nicht mehr", () => {
    const db = testDb();
    const { token } = erzeugeSitzung(db, { sub: "sub-1", name: "Jana Albers", rechnerId: null, einrichtung: null, jetzt: JETZT });
    expect(sitzungAus(db, token, nach(SITZUNG_GUELTIG_MS - 1_000))).not.toBeNull();
    expect(sitzungAus(db, token, nach(SITZUNG_GUELTIG_MS))).toBeNull();
    expect(sitzungAus(db, token, nach(SITZUNG_GUELTIG_MS + 1))).toBeNull();
  });

  it("verlängert sich nicht: sitzungAus ändert den Ablauf nicht", () => {
    const db = testDb();
    const { token, ablauf } = erzeugeSitzung(db, { sub: "sub-1", name: "Jana Albers", rechnerId: null, einrichtung: null, jetzt: JETZT });
    sitzungAus(db, token, nach(10 * 60_000));
    sitzungAus(db, token, nach(20 * 60_000));
    expect(sitzungAus(db, token, nach(29 * 60_000))?.ablauf).toEqual(ablauf);
    expect(db.select().from(sitzung).get()?.ablauf).toEqual(ablauf);
  });

  it("ohne Token, mit unbekanntem Token: null", () => {
    const db = testDb();
    erzeugeSitzung(db, { sub: "sub-1", name: "Jana Albers", rechnerId: null, einrichtung: null, jetzt: JETZT });
    expect(sitzungAus(db, null, JETZT)).toBeNull();
    expect(sitzungAus(db, "A".repeat(43), JETZT)).toBeNull();
  });

  it("ist der gebundene Rechner widerrufen, gilt die Sitzung nicht mehr", () => {
    const db = mitRechner();
    const { token } = erzeugeSitzung(db, { sub: "sub-1", name: "Jana Albers", rechnerId: "r1", einrichtung: null, jetzt: JETZT });
    expect(sitzungAus(db, token, JETZT)?.rechnerId).toBe("r1");
    db.update(rechner).set({ widerrufenAm: nach(1_000) }).where(eq(rechner.id, "r1")).run();
    expect(sitzungAus(db, token, nach(2_000))).toBeNull();
  });
});
