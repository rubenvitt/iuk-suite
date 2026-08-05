import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { migrierteTestDb, type TestDb } from "../../_db/testdb";
import { artikel, buchungen, chargen, lagerorte, newId } from "../../_db/schema";
import { umlagerung } from "./umlagerung";
import type { Quelle } from "./abbuchung";
import { bestandProLagerort } from "../domain/bestand";
import { HANDLAGER_ID } from "../konstanten";

const NOW = new Date("2026-06-15T10:00:00Z");
const QUELLE: Quelle = { quelleTyp: "token", quelleId: "111-111" };
let t: TestDb;

beforeEach(() => {
  t = migrierteTestDb("lagerbuch-sp-umlagerung-");
  t.db.insert(lagerorte).values(
    { id: "rtw-1", name: "RTW 1", typ: "fahrzeug", kennung: null, aktiv: true }).run();
  t.db.insert(artikel).values(
    { id: "a1", name: "Verband", einheit: "Stk.", fach: "A1",
      mindestbestand: 0, aktiv: true, createdAt: NOW }).run();
  t.db.insert(chargen).values([
    { id: "c-frueh", artikelId: "a1", chargenNr: "F", verfall: "2026-07", createdAt: NOW },
    { id: "c-spaet", artikelId: "a1", chargenNr: "S", verfall: "2028-01", createdAt: NOW },
  ]).run();
  for (const [chargeId, menge] of [["c-frueh", 3], ["c-spaet", 4]] as const) {
    t.db.insert(buchungen).values({
      id: newId(), ts: NOW, typ: "zugang", artikelId: "a1", chargeId,
      lagerortId: HANDLAGER_ID, menge, quelleTyp: "system", quelleId: "t",
      referenz: null, kommentar: null,
    }).run();
  }
});
afterEach(() => t.schliessen());

const alleZeilen = () => t.db.select().from(buchungen).all();
const summe = () => alleZeilen().reduce((s, b) => s + b.menge, 0);

function inTx<T>(fn: (tx: Parameters<Parameters<typeof t.db.transaction>[0]>[0]) => T): T {
  return t.db.transaction((tx) => fn(tx));
}

describe("umlagerung — I3: netto null", () => {
  it("die Summe ALLER Buchungen des Artikels ist vorher und nachher gleich", () => {
    const vorher = summe();
    inTx((tx) => umlagerung(tx, {
      artikelId: "a1", menge: 5, vonLagerortId: HANDLAGER_ID, nachLagerortId: "rtw-1",
      quelle: QUELLE, kommentar: null, referenz: "check:abc" }));
    expect(summe()).toBe(vorher);
  });

  it("verschiebt den Bestand vollstaendig zwischen den Lagerorten", () => {
    inTx((tx) => umlagerung(tx, {
      artikelId: "a1", menge: 5, vonLagerortId: HANDLAGER_ID, nachLagerortId: "rtw-1",
      quelle: QUELLE, kommentar: null, referenz: "check:abc" }));
    const roh = alleZeilen().map((b) => ({ lagerortId: b.lagerortId, menge: b.menge }));
    expect(bestandProLagerort(roh, HANDLAGER_ID)).toBe(2);
    expect(bestandProLagerort(roh, "rtw-1")).toBe(5);
  });
});

describe("umlagerung — das Ziel-Leg kommt STRIKT aus teile[]", () => {
  it("bei knapper Quelle wird nur das UMGELAGERTE gutgeschrieben", () => {
    /**
     * ⚠️ DIE ZEILE, VOR DER `umlagerung.ts:26` WARNT. Ein Ziel-Leg aus `menge`
     * statt aus `teile[]` erzeugte Bestand AUS DEM NICHTS: die Quelle wird an
     * ihrer Verfuegbarkeit gekappt, das Ziel bekaeme trotzdem die volle Menge, und
     * die Summe aller Buchungen waere nicht mehr gleich.
     */
    const vorher = summe();
    const r = inTx((tx) => umlagerung(tx, {
      artikelId: "a1", menge: 100, vonLagerortId: HANDLAGER_ID, nachLagerortId: "rtw-1",
      quelle: QUELLE, kommentar: null, referenz: "check:abc" }));
    expect(r.umgelagert).toBe(7);
    expect(summe()).toBe(vorher);
    const roh = alleZeilen().map((b) => ({ lagerortId: b.lagerortId, menge: b.menge }));
    expect(bestandProLagerort(roh, HANDLAGER_ID)).toBe(0);
    expect(bestandProLagerort(roh, "rtw-1")).toBe(7);
  });

  it("schreibt bei LEERER Quelle GAR KEINE Zeile", () => {
    const vorher = alleZeilen().length;
    const r = inTx((tx) => umlagerung(tx, {
      artikelId: "a1", menge: 5, vonLagerortId: "rtw-1", nachLagerortId: HANDLAGER_ID,
      quelle: QUELLE, kommentar: null, referenz: "check:abc" }));
    expect(r).toEqual({ umgelagert: 0, teile: [] });
    expect(alleZeilen()).toHaveLength(vorher);
  });
});

describe("umlagerung — die chargeId und der Typ", () => {
  it("erhaelt die chargeId je Teil — die Verfall-Provenienz wandert mit", () => {
    inTx((tx) => umlagerung(tx, {
      artikelId: "a1", menge: 5, vonLagerortId: HANDLAGER_ID, nachLagerortId: "rtw-1",
      quelle: QUELLE, kommentar: null, referenz: "check:abc" }));
    const zielLegs = alleZeilen().filter((b) => b.lagerortId === "rtw-1");
    expect(zielLegs.map((b) => [b.chargeId, b.menge]).sort())
      .toEqual([["c-frueh", 3], ["c-spaet", 2]].sort());
  });

  it("BEIDE Legs tragen typ 'umlagerung', nicht zugang/entnahme", () => {
    /**
     * `umlagerung.ts:8-9`: damit Reporting und Bestellvorschlag eine INTERNE
     * Verschiebung nicht als Wareneingang oder Verbrauch missverstehen. Genau
     * deshalb loescht eine Umlagerung die Bestellt-Markierung NICHT (§5.5) — nur
     * ein `zugang` tut das, und das bleibt 1:1.
     */
    inTx((tx) => umlagerung(tx, {
      artikelId: "a1", menge: 5, vonLagerortId: HANDLAGER_ID, nachLagerortId: "rtw-1",
      quelle: QUELLE, kommentar: null, referenz: "check:abc" }));
    const neu = alleZeilen().filter((b) => b.referenz === "check:abc");
    expect(neu).toHaveLength(4);
    for (const b of neu) expect(b.typ).toBe("umlagerung");
  });

  it("traegt Referenz, Kommentar und Quelle auf BEIDEN Legs", () => {
    inTx((tx) => umlagerung(tx, {
      artikelId: "a1", menge: 3, vonLagerortId: HANDLAGER_ID, nachLagerortId: "rtw-1",
      quelle: QUELLE, kommentar: "Nachfüllung", referenz: "check:xyz" }));
    for (const b of alleZeilen().filter((x) => x.referenz === "check:xyz")) {
      expect(b.kommentar).toBe("Nachfüllung");
      expect(b.quelleTyp).toBe("token");
      expect(b.quelleId).toBe("111-111");
    }
  });
});
