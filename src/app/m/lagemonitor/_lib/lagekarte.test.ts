import { describe, expect, it } from "vitest";
import { auditOutbox, kartenobjekt } from "../_db/schema";
import { etagVon } from "./etag";
import type { Quellen } from "./fahrzeuge";
import { alsVertrag } from "./konfiguration";
import { aendereObjekt, alsMapObjects, legeObjektAn, listeLagekarte, loescheObjekt, schalteObjekt } from "./lagekarte";
import { geschlosseneRing, inVorschau, LAGEKARTE_MAX, lagekarteEingabe, schwerpunkt, umriss, type LagekarteDaten, type LagekarteEingabe } from "./lagekarteRegeln";
import { testDb } from "./testDb";

const JETZT = new Date("2026-11-04T08:00:00Z");
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>';
const Q: Pick<Quellen, "zeichen" | "svg"> = {
  zeichen: () => [{ schluessel: "rezept:F.3.15", titel: "Unterkunft" }, { schluessel: "rezept:F.3.8", titel: "Bereitstellungsraum" }],
  svg: (k) => Object.fromEntries(k.filter((x) => x.startsWith("rezept:")).map((x) => [x, SVG])),
};
const QUADRAT: [number, number][] = [[10.5, 52.9], [10.6, 52.9], [10.6, 53.0], [10.5, 53.0]];

const daten = (e: LagekarteEingabe): LagekarteDaten => lagekarteEingabe.parse(e);
const punkt = (name: string, extra: Partial<Extract<LagekarteEingabe, { art: "punkt" }>> = {}) =>
  daten({ art: "punkt", name, zeichen: "rezept:F.3.15", breite: 52.97, laenge: 10.56, ...extra });
const flaeche = (name: string, extra: Partial<Extract<LagekarteEingabe, { art: "flaeche" }>> = {}) =>
  daten({ art: "flaeche", name, farbe: "ocker", ring: QUADRAT, ...extra });

describe("Eingabe", () => {
  it("prüft Punkt und Fläche getrennt", () => {
    expect(lagekarteEingabe.safeParse({ art: "punkt", name: "Wache", zeichen: "x", breite: 52.9, laenge: 10.5 }).success).toBe(true);
    expect(lagekarteEingabe.safeParse({ art: "punkt", name: "Wache", zeichen: "x", breite: 91, laenge: 10.5 }).success).toBe(false);
    expect(lagekarteEingabe.safeParse({ art: "punkt", name: "Wache", zeichen: "", breite: 52.9, laenge: 10.5 }).success).toBe(false);
    expect(lagekarteEingabe.safeParse({ art: "punkt", name: "  ", zeichen: "x", breite: 52.9, laenge: 10.5 }).success).toBe(false);
    expect(lagekarteEingabe.safeParse({ art: "punkt", name: "x".repeat(61), zeichen: "x", breite: 52.9, laenge: 10.5 }).success).toBe(false);
    // Felder der anderen Art kommen nicht durch (strict).
    expect(lagekarteEingabe.safeParse({ art: "punkt", name: "Wache", zeichen: "x", breite: 52.9, laenge: 10.5, farbe: "blau" }).success).toBe(false);
    expect(lagekarteEingabe.safeParse({ art: "flaeche", name: "Raum", farbe: "rot", ring: QUADRAT }).success).toBe(false);
    expect(lagekarteEingabe.safeParse({ art: "kreis", name: "Raum" }).success).toBe(false);
  });

  it("eine Fläche braucht 3 bis 200 Ecken; ein geschlossener Ring verliert den Schlusspunkt", () => {
    expect(lagekarteEingabe.safeParse({ art: "flaeche", name: "R", farbe: "blau", ring: QUADRAT.slice(0, 2) }).success).toBe(false);
    const geschlossen = daten({ art: "flaeche", name: "R", farbe: "blau", ring: [...QUADRAT.slice(0, 3), QUADRAT[0]] });
    expect(geschlossen.art === "flaeche" && geschlossen.ring).toEqual(QUADRAT.slice(0, 3));
    // Drei Punkte, davon der letzte der erste: nur zwei Ecken.
    expect(lagekarteEingabe.safeParse({ art: "flaeche", name: "R", farbe: "blau", ring: [QUADRAT[0], QUADRAT[1], QUADRAT[0]] }).success).toBe(false);
    const viele = Array.from({ length: 201 }, (_, i): [number, number] => [10 + Math.cos(i) / 10, 52 + Math.sin(i) / 10]);
    expect(lagekarteEingabe.safeParse({ art: "flaeche", name: "R", farbe: "blau", ring: viele }).success).toBe(false);
    expect(lagekarteEingabe.safeParse({ art: "flaeche", name: "R", farbe: "blau", ring: viele.slice(0, 200) }).success).toBe(true);
    expect(lagekarteEingabe.safeParse({ art: "flaeche", name: "R", farbe: "blau", ring: [[181, 52], [10, 52], [10, 53]] }).success).toBe(false);
  });

  it("rundet auf sechs Nachkommastellen", () => {
    const p = punkt("Wache", { breite: 52.123456789, laenge: 10.987654321 });
    expect(p.art === "punkt" && [p.breite, p.laenge]).toEqual([52.123457, 10.987654]);
  });
});

describe("Schwerpunkt", () => {
  it("eines Quadrats ist seine Mitte, offen wie geschlossen", () => {
    expect(schwerpunkt(QUADRAT)).toEqual([10.55, 52.95]);
    expect(schwerpunkt(geschlosseneRing(QUADRAT))).toEqual([10.55, 52.95]);
  });

  it("eines L ist der Flächenschwerpunkt, nicht der Mittelwert der Ecken", () => {
    // L aus zwei Einheitsquadraten unten und einem darüber links: Fläche 3, Schwerpunkt (5/6, 5/6).
    const l: [number, number][] = [[0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2]];
    const [x, y] = schwerpunkt(l);
    expect(x).toBeCloseTo(5 / 6, 5);
    expect(y).toBeCloseTo(5 / 6, 5);
    // Gleiches Ergebnis unabhängig vom Umlaufsinn.
    expect(schwerpunkt([...l].reverse())).toEqual(schwerpunkt(l));
  });

  it("ohne Fläche (alle Ecken auf einer Linie) der Mittelwert", () => {
    expect(schwerpunkt([[10, 52], [10.2, 52], [10.4, 52]])).toEqual([10.2, 52]);
  });

  it("geschlossen heißt: erster Punkt am Ende noch einmal", () => {
    expect(geschlosseneRing(QUADRAT)).toEqual([...QUADRAT, QUADRAT[0]]);
    expect(umriss(QUADRAT)).toEqual([[10.5, 52.9], [10.6, 53.0]]);
    expect(umriss([])).toBeNull();
  });

  it("die Vorschau rechnet Web-Mercator um die Mitte", () => {
    const f = { mitteX: 100, mitteY: 50, massstab: 1 };
    expect(inVorschau([10, 52], [10, 52], 9, f)).toEqual([100, 50]);
    const [ostX, ostY] = inVorschau([10.1, 52], [10, 52], 9, f);
    expect(ostX).toBeGreaterThan(100);
    expect(ostY).toBeCloseTo(50, 6);
    const [, nordY] = inVorschau([10, 52.1], [10, 52], 9, f);
    expect(nordY).toBeLessThan(50);
  });
});

describe("Lagekarte in der Datenbank", () => {
  it("legt an, ändert, schaltet und löscht, mit Audit", () => {
    const db = testDb();
    const r = legeObjektAn(db, punkt("Wache Nord"), "Verwaltung", JETZT, Q);
    if (!r.ok) throw new Error(r.fehler);
    expect(r.id).toMatch(/^lk-[A-Za-z0-9_-]{12}$/);
    expect(listeLagekarte(db, Q).liste).toEqual([
      expect.objectContaining({ id: r.id, art: "punkt", name: "Wache Nord", zeichenTitel: "Unterkunft", svg: SVG, farbe: null, ring: null, aufKarte: true }),
    ]);
    // Aus dem Punkt wird eine Fläche: die Felder des Punkts fallen weg.
    expect(aendereObjekt(db, r.id, flaeche("Raum"), "Verwaltung", JETZT, Q)).toEqual({ ok: true, id: r.id });
    const zeile = db.select().from(kartenobjekt).get()!;
    expect(zeile).toMatchObject({ art: "flaeche", zeichen: null, breite: null, laenge: null, farbe: "ocker", ring: JSON.stringify(QUADRAT) });
    expect(schalteObjekt(db, r.id, false, "Verwaltung")).toBe(true);
    expect(listeLagekarte(db, Q).liste[0].aufKarte).toBe(false);
    expect(loescheObjekt(db, r.id)).toBe(true);
    expect(loescheObjekt(db, r.id)).toBe(false);
    expect(aendereObjekt(db, r.id, flaeche("Raum"), "Verwaltung", JETZT, Q)).toEqual({ ok: false, fehler: "Dieses Objekt gibt es nicht mehr." });
    expect(schalteObjekt(db, r.id, true, "Verwaltung")).toBe(false);
    const aktionen = db.select().from(auditOutbox).all().filter((a) => a.objectType === "lagemonitor_kartenobjekt").map((a) => a.action);
    expect(aktionen).toEqual(["create", "update", "update", "delete"]);
  });

  it("ein unbekanntes Zeichen wird abgelehnt", () => {
    const db = testDb();
    expect(legeObjektAn(db, punkt("Wache", { zeichen: "weg" }), "Verwaltung", JETZT, Q)).toEqual({ ok: false, fehler: "Dieses Zeichen gibt es nicht (mehr)." });
  });

  it(`höchstens ${LAGEKARTE_MAX} Objekte`, () => {
    const db = testDb();
    for (let i = 0; i < LAGEKARTE_MAX; i++) expect(legeObjektAn(db, flaeche(`Raum ${i}`), "Verwaltung", JETZT, Q).ok).toBe(true);
    expect(legeObjektAn(db, flaeche("Einer zu viel"), "Verwaltung", JETZT, Q)).toMatchObject({ ok: false });
  });
});

describe("Drahtformat mapObjects", () => {
  it("nur eingeschaltete, Flächen vor Punkten, je nach Name; Fläche geschlossen mit Schwerpunkt", () => {
    const db = testDb();
    legeObjektAn(db, punkt("Wache 10"), "V", JETZT, Q);
    legeObjektAn(db, punkt("Wache 9", { breite: 52.9, laenge: 10.5 }), "V", JETZT, Q);
    legeObjektAn(db, flaeche("Süd", { farbe: "tuerkis" }), "V", JETZT, Q);
    legeObjektAn(db, flaeche("Nord"), "V", JETZT, Q);
    const aus = legeObjektAn(db, punkt("Aus", { aufKarte: false }), "V", JETZT, Q);
    expect(aus.ok).toBe(true);
    const objekte = alsMapObjects(db, Q);
    expect(objekte.map((o) => o.name)).toEqual(["Nord", "Süd", "Wache 9", "Wache 10"]);
    expect(objekte[1]).toEqual({ id: expect.stringMatching(/^lk-/), kind: "area", name: "Süd", color: "teal", ring: [...QUADRAT, QUADRAT[0]], lat: 52.95, lon: 10.55 });
    expect(objekte[2]).toEqual({ id: expect.stringMatching(/^lk-/), kind: "point", name: "Wache 9", symbol: SVG, lat: 52.9, lon: 10.5 });
    expect(JSON.stringify(objekte)).not.toMatch(/At"|angelegt|geaendert/);
  });

  it("ein Punkt mit unbekanntem Zeichen geht mit symbol null hinaus; ist kommplan nicht lesbar, auch", () => {
    const db = testDb();
    legeObjektAn(db, punkt("Wache"), "V", JETZT, Q);
    expect(alsMapObjects(db, { svg: () => ({}) })[0]).toMatchObject({ kind: "point", symbol: null });
    expect(alsMapObjects(db, { svg: () => { throw new Error("kommplan weg"); } })[0]).toMatchObject({ kind: "point", symbol: null });
  });

  it("steht im Vertrag; der ETag hält, solange sich nichts ändert", () => {
    const db = testDb();
    expect(alsVertrag(db).mapObjects).toEqual([]);
    legeObjektAn(db, flaeche("Bereitstellungsraum"), "V", JETZT, Q);
    const koerper = (jetzt: Date) => JSON.stringify(alsVertrag(db, jetzt, [], undefined, alsMapObjects(db, Q)));
    const etag = etagVon(koerper(new Date("2026-11-04T08:00:00Z")));
    expect(etagVon(koerper(new Date("2026-11-04T08:01:00Z")))).toBe(etag);
    const id = db.select().from(kartenobjekt).get()!.id;
    schalteObjekt(db, id, false, "V");
    expect(etagVon(koerper(new Date("2026-11-04T08:02:00Z")))).not.toBe(etag);
    expect(alsVertrag(db, JETZT, [], undefined, alsMapObjects(db, Q)).mapObjects).toEqual([]);
  });
});
