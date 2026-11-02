import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import type { BereitgestelltesFahrzeug } from "@/app/m/fahrzeuge/_lib/bereitstellung";
import { alsVehicles, legeFahrzeugAn, listeFahrzeuge, loescheFahrzeug, meldePosition, positionAusKopf, type Quellen } from "./fahrzeuge";
import { alsVertrag } from "./konfiguration";
import { legeZugangAn, widerrufeZugang } from "./schluessel";
import { testDb } from "./testDb";

const JETZT = new Date("2026-11-02T14:00:00Z");
const FUEKW: BereitgestelltesFahrzeug = { id: "s1", art: "fahrzeug", typ: "FüKw", funkrufname: "Rotkreuz Uelzen 40-12-1", funkkenner: "40-12-1", kennzeichen: null, standort: "Uelzen", aktiv: true };
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>';
const Q: Quellen = {
  stamm: () => [FUEKW, { ...FUEKW, id: "s2", funkrufname: "Rotkreuz Uelzen 19-1", aktiv: false }],
  zeichen: () => [{ schluessel: "rezept:E.2.19", titel: "Führungskraftwagen" }],
  svg: (k) => Object.fromEntries(k.filter((x) => x === "rezept:E.2.19").map((x) => [x, SVG])),
};
const KAPUTT: Quellen = { stamm: () => { throw new Error("weg"); }, zeichen: () => { throw new Error("weg"); }, svg: () => { throw new Error("weg"); } };

function mitFuekw() {
  const db = testDb();
  const { id: zugangId } = legeZugangAn(db, "FüKw", "Jana");
  expect(legeFahrzeugAn(db, { stammId: "s1", zeichen: "rezept:E.2.19", zugangId }, "Jana", JETZT, Q)).toEqual({ ok: true });
  return { db, zugangId };
}

describe("Position aus der Kopfzeile", () => {
  it("liest Breite, Länge und Alter", () => {
    expect(positionAusKopf("52.96371,10.5772,12")).toEqual({ lat: 52.96371, lon: 10.5772, alterS: 12 });
    expect(positionAusKopf("-33.9,-70.1,0")).toEqual({ lat: -33.9, lon: -70.1, alterS: 0 });
  });
  it("übergeht alles Kaputte, Unmögliche und zu Alte", () => {
    for (const w of [null, "", "52.9,10.5", "52.9;10.5;1", "91,10,1", "52,181,1", "52,10,-1", "NaN,10,1", "52,10,86401", "1e2,10,1"]) expect(positionAusKopf(w)).toBeNull();
  });
});

describe("Fahrzeuge auf der Karte", () => {
  it("die Meldung über den Zugang setzt nur die letzte Position, mit dem Zeitpunkt des Fixes", () => {
    const { db, zugangId } = mitFuekw();
    meldePosition(db, zugangId, { lat: 52.9, lon: 10.5, alterS: 30 }, JETZT);
    meldePosition(db, zugangId, { lat: 53.0, lon: 10.6, alterS: 5 }, new Date(JETZT.getTime() + 60_000));
    expect(alsVehicles(db, null, JETZT, Q)).toEqual([
      { id: expect.any(String), callSign: "Rotkreuz Uelzen 40-12-1", symbol: SVG, lat: 53.0, lon: 10.6, at: "2026-11-02T14:00:55.000Z", own: false },
    ]);
    expect(alsVehicles(db, zugangId, JETZT, Q)[0].own).toBe(true);
  });

  it("die Position steht nicht im Audit — sonst wäre es ein Bewegungsprofil", () => {
    const { db, zugangId } = mitFuekw();
    const vorher = db.get<{ n: number }>(sql`SELECT count(*) n FROM audit_outbox WHERE object_type = 'lagemonitor_fahrzeug'`).n;
    meldePosition(db, zugangId, { lat: 52.9, lon: 10.5, alterS: 0 }, JETZT);
    expect(db.get<{ n: number }>(sql`SELECT count(*) n FROM audit_outbox WHERE object_type = 'lagemonitor_fahrzeug'`).n).toBe(vorher);
  });

  it("ohne Position, mit Position älter als 24 Stunden oder ohne lesbare Quellen geht kein Fahrzeug hinaus", () => {
    const { db, zugangId } = mitFuekw();
    expect(alsVehicles(db, null, JETZT, Q)).toEqual([]);
    meldePosition(db, zugangId, { lat: 52.9, lon: 10.5, alterS: 0 }, JETZT);
    expect(alsVehicles(db, null, new Date(JETZT.getTime() + 24 * 3600_000), Q)).toHaveLength(1);
    expect(alsVehicles(db, null, new Date(JETZT.getTime() + 24 * 3600_000 + 1), Q)).toEqual([]);
    expect(alsVehicles(db, null, JETZT, KAPUTT)).toEqual([]);
    expect(alsVertrag(db, JETZT, alsVehicles(db, null, JETZT, Q)).vehicles).toHaveLength(1);
  });

  it("prüft beim Anlegen Fahrzeug, Zeichen und Zugang gegen die Quellen", () => {
    const { db, zugangId } = mitFuekw();
    const { id: frei } = legeZugangAn(db, "Wache", "Jana");
    expect(legeFahrzeugAn(db, { stammId: "s1", zeichen: "rezept:E.2.19", zugangId: null }, "Jana", JETZT, Q)).toEqual({ ok: false, fehler: "„Rotkreuz Uelzen 40-12-1“ steht schon auf der Karte." });
    expect(legeFahrzeugAn(db, { stammId: "s2", zeichen: "rezept:E.2.19", zugangId: null }, "Jana", JETZT, Q)).toMatchObject({ ok: false });
    expect(legeFahrzeugAn(db, { stammId: "s9", zeichen: "rezept:E.2.19", zugangId: null }, "Jana", JETZT, KAPUTT)).toMatchObject({ ok: false });
    const zweites: Quellen = { ...Q, stamm: () => [FUEKW, { ...FUEKW, id: "s3", funkrufname: "Rotkreuz Uelzen 83-1" }] };
    expect(legeFahrzeugAn(db, { stammId: "s3", zeichen: "rezept:fehlt", zugangId: null }, "Jana", JETZT, zweites)).toEqual({ ok: false, fehler: "Dieses Zeichen gibt es nicht (mehr)." });
    expect(legeFahrzeugAn(db, { stammId: "s3", zeichen: "rezept:E.2.19", zugangId }, "Jana", JETZT, zweites)).toEqual({ ok: false, fehler: "Dieser Zugang meldet schon für ein anderes Fahrzeug." });
    expect(legeFahrzeugAn(db, { stammId: "s3", zeichen: "rezept:E.2.19", zugangId: "gibt-es-nicht" }, "Jana", JETZT, zweites)).toEqual({ ok: false, fehler: "Diesen Zugang gibt es nicht mehr." });
    expect(legeFahrzeugAn(db, { stammId: "s3", zeichen: "rezept:E.2.19", zugangId: frei }, "Jana", JETZT, zweites)).toEqual({ ok: true });
  });

  it("Liste und Auswahl: vergebene Fahrzeuge und Zugänge stehen nicht mehr zur Wahl; ein widerrufener Zugang löst nur die Verbindung", () => {
    const { db, zugangId } = mitFuekw();
    const { id: frei } = legeZugangAn(db, "Wache", "Jana");
    const { liste, auswahl } = listeFahrzeuge(db, Q);
    expect(liste).toEqual([{ id: expect.any(String), funkrufname: "Rotkreuz Uelzen 40-12-1", zeichenTitel: "Führungskraftwagen", svg: SVG, zugang: "FüKw", gemeldetAm: null }]);
    expect(auswahl.stamm).toEqual([]);
    expect(auswahl.zugaenge).toEqual([{ id: frei, bezeichnung: "Wache" }]);
    widerrufeZugang(db, zugangId);
    expect(listeFahrzeuge(db, Q).liste[0].zugang).toBeNull();
    expect(listeFahrzeuge(db, KAPUTT).liste[0]).toMatchObject({ funkrufname: null, svg: null });
    expect(loescheFahrzeug(db, liste[0].id)).toBe(true);
    expect(listeFahrzeuge(db, Q).liste).toEqual([]);
  });
});
