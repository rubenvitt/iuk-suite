import { describe, expect, it } from "vitest";
import type { BereitgestelltesFahrzeug } from "@/app/m/fahrzeuge/_lib/bereitstellung";
import { auditOutbox, fahrzeug } from "../_db/schema";
import { legeFahrzeugAn, meldePosition, type Quellen } from "./fahrzeuge";
import { STANDORT_VORGABE } from "./konfiguration";
import { legeZugangAn } from "./schluessel";
import { festeOrte, listeStandorte, ORT_PRAEFIX, setzeStandort, standortEingabe, standortFuer, type StandortEingabe } from "./standort";
import { testDb } from "./testDb";

const JETZT = new Date("2026-11-03T08:00:00Z");
const FUEKW: BereitgestelltesFahrzeug = { id: "s1", art: "fahrzeug", typ: "FüKw", funkrufname: "Rotkreuz Uelzen 40-12-1", funkkenner: "40-12-1", kennzeichen: null, standort: "Uelzen", aktiv: true };
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>';
const Q: Quellen = {
  stamm: () => [FUEKW],
  zeichen: () => [{ schluessel: "rezept:E.2.19", titel: "Führungskraftwagen" }, { schluessel: "rezept:U.1", titel: "Unterkunft" }],
  svg: (k) => Object.fromEntries(k.filter((x) => x.startsWith("rezept:")).map((x) => [x, SVG])),
};

function aufbau() {
  const db = testDb();
  const fuekw = legeZugangAn(db, "FüKw", "Verwaltung").id;
  const online = legeZugangAn(db, "Online", "Verwaltung").id;
  expect(legeFahrzeugAn(db, { stammId: "s1", zeichen: "rezept:E.2.19", zugangId: null }, "Verwaltung", JETZT, Q)).toEqual({ ok: true });
  const fahrzeugId = db.select().from(fahrzeug).get()!.id;
  return { db, fuekw, online, fahrzeugId };
}

const fest = (zugangId: string): Extract<StandortEingabe, { art: "fest" }> => ({ zugangId, art: "fest", name: "Unterkunft Uelzen", breite: 52.97, laenge: 10.56, zeichen: "rezept:U.1" });

describe("Standort je Monitor", () => {
  it("ohne Einstellung die Vorgabe, mit dem Namen des Zugangs", () => {
    const { db, online } = aufbau();
    expect(standortFuer(db, online, JETZT)).toEqual({ ...STANDORT_VORGABE, label: "Online" });
    expect(standortFuer(db, "weg", JETZT)).toEqual(STANDORT_VORGABE);
  });

  it("ein fester Ort ist der Standort und steht mit Zeichen auf allen Monitoren, nur beim eigenen als own", () => {
    const { db, fuekw, online } = aufbau();
    expect(setzeStandort(db, fest(online), Q)).toEqual({ ok: true });
    expect(standortFuer(db, online, JETZT)).toEqual({ lat: 52.97, lon: 10.56, label: "Unterkunft Uelzen" });
    const [ort] = festeOrte(db, online, Q);
    expect(ort).toMatchObject({ id: `${ORT_PRAEFIX}${online}`, callSign: "Unterkunft Uelzen", symbol: SVG, lat: 52.97, lon: 10.56, own: true, fixed: true });
    expect(festeOrte(db, fuekw, Q)[0].own).toBe(false);
    // Stabil über Abholungen: sonst gäbe es nie ein 304.
    expect(festeOrte(db, online, Q)).toEqual([ort]);
  });

  it("GPS hängt das Fahrzeug an den Zugang; der Standort ist seine letzte Position, ohne sie der eingestellte Ort", () => {
    const { db, fuekw, fahrzeugId } = aufbau();
    const e = standortEingabe.parse({ zugangId: fuekw, art: "gps", name: "FüKw Uelzen", fahrzeugId, breite: 52.9, laenge: 10.5 });
    expect(setzeStandort(db, e, Q)).toEqual({ ok: true });
    expect(db.select().from(fahrzeug).get()!.zugangId).toBe(fuekw);
    expect(standortFuer(db, fuekw, JETZT)).toEqual({ lat: 52.9, lon: 10.5, label: "FüKw Uelzen" });
    meldePosition(db, fuekw, { lat: 53.1, lon: 10.7, alterS: 10 }, JETZT);
    expect(standortFuer(db, fuekw, JETZT)).toEqual({ lat: 53.1, lon: 10.7, label: "FüKw Uelzen" });
    // Ein Zugang mit Fahrzeug ist kein fester Ort.
    expect(festeOrte(db, fuekw, Q)).toEqual([]);
    expect(listeStandorte(db, Q).je[fuekw]).toMatchObject({ art: "gps", fahrzeugId, fahrzeugName: "Rotkreuz Uelzen 40-12-1", svg: SVG });
  });

  it("fest löst das Fahrzeug; ein Fahrzeug eines anderen Zugangs ist nicht wählbar", () => {
    const { db, fuekw, online, fahrzeugId } = aufbau();
    setzeStandort(db, standortEingabe.parse({ zugangId: fuekw, art: "gps", name: "FüKw", fahrzeugId, breite: null, laenge: null }), Q);
    expect(setzeStandort(db, standortEingabe.parse({ zugangId: online, art: "gps", name: "Online", fahrzeugId, breite: null, laenge: null }), Q))
      .toEqual({ ok: false, fehler: "Dieses Fahrzeug meldet schon über einen anderen Zugang." });
    expect(setzeStandort(db, fest(fuekw), Q)).toEqual({ ok: true });
    expect(db.select().from(fahrzeug).get()!.zugangId).toBeNull();
    expect(listeStandorte(db, Q).je[fuekw].art).toBe("fest");
  });

  it("prüft Zeichen, Koordinaten und Pflichtfelder", () => {
    const { db, online } = aufbau();
    expect(setzeStandort(db, { ...fest(online), zeichen: "gibt-es-nicht" }, Q)).toEqual({ ok: false, fehler: "Dieses Zeichen gibt es nicht (mehr)." });
    const felder = standortEingabe.safeParse({ zugangId: online, art: "fest", name: "", breite: 95, laenge: null, zeichen: "" }).error!.issues.map((i) => i.path.join("."));
    expect(felder).toEqual(expect.arrayContaining(["name", "breite", "laenge", "zeichen"]));
    expect(standortEingabe.safeParse({ zugangId: online, art: "gps", name: "FüKw", fahrzeugId: "", breite: null, laenge: null }).success).toBe(false);
  });

  it("eine Änderung des Standorts steht im Audit", () => {
    const { db, online } = aufbau();
    const vorher = db.select().from(auditOutbox).all().length;
    setzeStandort(db, fest(online), Q);
    expect(db.select().from(auditOutbox).all().slice(vorher).map((z) => [z.objectType, z.action])).toContainEqual(["lagemonitor_zugang", "update"]);
  });
});
