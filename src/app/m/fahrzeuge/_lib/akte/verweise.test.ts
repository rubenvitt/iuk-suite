import { describe, expect, it } from "vitest";
import { quellzuordnung, stammfahrzeug } from "../../_db/schema";
import { testDb, type TestDb } from "../testDb";
import { akteVerweise } from "./verweise";

const FAHRZEUG = { id: "fz-1", typ: "RTW", funkkenner: "11-83-1", funkrufname: "Rotkreuz Uelzen 11-83-1" };
const ENV = { SUITE_ADMIN_GROUP_LAGERBUCH: "lagerbuch-admin", SUITE_ADMIN_GROUP_RADIO: "radio-admin", SUITE_UPDATER_GROUP_RADIO: "radio-updater" };
const basis = (modul: string) => `https://${modul}.example`;

function dbMit(zuordnungen: { quelle: "lagerbuch" | "funkgeraete" | "einsatzbuch"; quellId: string; stammId: string | null }[]): TestDb {
  const db = testDb();
  const jetzt = new Date("2026-11-01T08:00:00Z");
  for (const id of ["fz-1", "fz-2"]) {
    db.insert(stammfahrzeug).values({ id, typ: "RTW", funkrufname: `Fahrzeug ${id}`, standort: "Uelzen", angelegtAm: jetzt, aktualisiertAm: jetzt }).run();
  }
  for (const z of zuordnungen) db.insert(quellzuordnung).values({ ...z, entschiedenAm: jetzt, entschiedenVon: "Test" }).run();
  return db;
}

describe("Verweise der Akte in Lagerbuch und Funkgeräte", () => {
  it("wer beide Verwaltungen öffnen darf, landet genau beim Fahrzeug", () => {
    const db = dbMit([
      { quelle: "lagerbuch", quellId: "ort-7", stammId: "fz-1" },
      { quelle: "lagerbuch", quellId: "ort-8", stammId: "fz-2" },
      { quelle: "einsatzbuch", quellId: "eb-1", stammId: "fz-1" },
    ]);
    expect(akteVerweise(db, FAHRZEUG, ["lagerbuch-admin", "radio-updater"], basis, ENV)).toEqual({
      lagerbuch: { href: "https://lagerbuch.example/verwaltung/fahrzeuge/ort-7", genau: true },
      funk: { href: "https://radio.example/admin/geraete?lagerort=RTW%2011-83-1", genau: true },
    });
  });

  it("ohne oder mit mehreren Zuordnungen bleibt es bei der Fahrzeugliste des Lagerbuchs", () => {
    expect(akteVerweise(dbMit([]), FAHRZEUG, ["lagerbuch-admin"], basis, ENV).lagerbuch).toEqual({ href: "https://lagerbuch.example/verwaltung/fahrzeuge", genau: false });
    const doppelt = dbMit([{ quelle: "lagerbuch", quellId: "ort-7", stammId: "fz-1" }, { quelle: "lagerbuch", quellId: "ort-9", stammId: "fz-1" }]);
    expect(akteVerweise(doppelt, FAHRZEUG, ["lagerbuch-admin"], basis, ENV).lagerbuch).toEqual({ href: "https://lagerbuch.example/verwaltung/fahrzeuge", genau: false });
  });

  it("wer die Verwaltung dort nicht öffnen darf, bekommt die Startseite der App — auch der Suite-Admin im Lagerbuch", () => {
    const db = dbMit([{ quelle: "lagerbuch", quellId: "ort-7", stammId: "fz-1" }]);
    for (const gruppen of [["fahrzeuge-admin"], ["admin"], null]) {
      expect(akteVerweise(db, FAHRZEUG, gruppen, basis, ENV).lagerbuch).toEqual({ href: "https://lagerbuch.example", genau: false });
    }
    expect(akteVerweise(db, FAHRZEUG, ["fahrzeuge-admin"], basis, ENV).funk).toEqual({ href: "https://radio.example", genau: false });
  });

  it("ohne Funkkenner filtert die Geräteliste nach dem Funkrufnamen; ein Name mit Komma geht nur zur Liste", () => {
    const db = dbMit([]);
    const anhaenger = { id: "fz-2", typ: "Anhänger", funkkenner: null, funkrufname: "Anhänger Betreuung Uelzen" };
    expect(akteVerweise(db, anhaenger, ["radio-admin"], basis, ENV).funk?.href).toBe("https://radio.example/admin/geraete?lagerort=Anh%C3%A4nger%20Betreuung%20Uelzen");
    expect(akteVerweise(db, { ...anhaenger, funkrufname: "Anhänger, groß" }, ["radio-admin"], basis, ENV).funk).toEqual({ href: "https://radio.example/admin/geraete", genau: false });
  });

  it("hat eine App hier keine Adresse, gibt es keinen Verweis", () => {
    expect(akteVerweise(dbMit([]), FAHRZEUG, ["lagerbuch-admin", "radio-admin"], () => null, ENV)).toEqual({ lagerbuch: null, funk: null });
  });
});
