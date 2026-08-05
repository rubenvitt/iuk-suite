import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { migrierteTestDb, type TestDb } from "../../_db/testdb";
import { artikel, buchungen, chargen, lagerorte, newId } from "../../_db/schema";
import { fefoAbbuchung, type Quelle } from "./abbuchung";
import { bestandProLagerort } from "../domain/bestand";
import { HANDLAGER_ID } from "../konstanten";

const NOW = new Date("2026-06-15T10:00:00Z");
const QUELLE: Quelle = { quelleTyp: "system", quelleId: "test" };
let t: TestDb;

beforeEach(() => {
  t = migrierteTestDb("lagerbuch-sp-abbuchung-");
  t.db.insert(lagerorte).values(
    { id: "rtw-1", name: "RTW 1", typ: "fahrzeug", kennung: null, aktiv: true }).run();
  t.db.insert(artikel).values(
    { id: "a1", name: "Verband", einheit: "Stk.", fach: "A1",
      mindestbestand: 0, aktiv: true, createdAt: NOW }).run();
  t.db.insert(chargen).values([
    { id: "c-frueh", artikelId: "a1", chargenNr: "F", verfall: "2026-07", createdAt: NOW },
    { id: "c-spaet", artikelId: "a1", chargenNr: "S", verfall: "2028-01", createdAt: NOW },
  ]).run();
  const b = (chargeId: string, lagerortId: string, menge: number) => ({
    id: newId(), ts: NOW, typ: "zugang" as const, artikelId: "a1", chargeId, lagerortId, menge,
    quelleTyp: "system" as const, quelleId: "t", referenz: null, kommentar: null,
  });
  t.db.insert(buchungen).values([
    b("c-frueh", HANDLAGER_ID, 3),
    b("c-spaet", HANDLAGER_ID, 10),
    b("c-frueh", "rtw-1", 5),      // DIESELBE Charge im Fahrzeug
  ]).run();
});
afterEach(() => t.schliessen());

/** Fuehrt `fn` in einer echten Transaktion aus — die Kerne laufen NUR dort. */
function inTx<T>(fn: (tx: Parameters<Parameters<typeof t.db.transaction>[0]>[0]) => T): T {
  return t.db.transaction((tx) => fn(tx));
}

describe("fefoAbbuchung — FEFO und die Lagerort-Bindung", () => {
  it("raeumt die frueher ablaufende Charge zuerst ab", () => {
    const r = inTx((tx) => fefoAbbuchung(tx, {
      artikelId: "a1", menge: 5, quelle: QUELLE, kommentar: null, referenz: null }));
    expect(r.gebucht).toBe(5);
    expect(r.teile).toEqual([{ chargeId: "c-frueh", menge: 3 }, { chargeId: "c-spaet", menge: 2 }]);
  });

  it("sieht den FAHRZEUG-Bestand derselben Charge NICHT", () => {
    /**
     * ⚠️ DIE ZEILE, UM DIE ES GEHT. `abbuchung.ts:38` laedt heute alle Buchungen
     * des Artikels OHNE Lagerort-Praedikat. Ohne das Scoping saehe die Abbuchung
     * fuer `c-frueh` einen Rest von 8 (3 + 5) statt 3 — sie buchte 5 statt 3 ab
     * und drueckte den Handlager-Bestand ins Negative (I2 gebrochen).
     */
    const r = inTx((tx) => fefoAbbuchung(tx, {
      artikelId: "a1", menge: 3, quelle: QUELLE, kommentar: null, referenz: null }));
    expect(r.teile).toEqual([{ chargeId: "c-frueh", menge: 3 }]);
    const roh = t.db.select().from(buchungen).all()
      .map((x) => ({ lagerortId: x.lagerortId, menge: x.menge }));
    expect(bestandProLagerort(roh, HANDLAGER_ID)).toBe(10);
    expect(bestandProLagerort(roh, "rtw-1")).toBe(5);
  });

  it("bucht auf Wunsch von einem ANDEREN Lagerort ab", () => {
    const r = inTx((tx) => fefoAbbuchung(tx, {
      artikelId: "a1", menge: 99, lagerortId: "rtw-1",
      quelle: QUELLE, kommentar: null, referenz: null }));
    expect(r).toEqual({ gebucht: 5, teile: [{ chargeId: "c-frueh", menge: 5 }] });
  });
});

describe("fefoAbbuchung — I2: der Bestand wird nie negativ", () => {
  it("kappt an der Verfuegbarkeit AN DIESEM Lagerort", () => {
    const r = inTx((tx) => fefoAbbuchung(tx, {
      artikelId: "a1", menge: 1000, quelle: QUELLE, kommentar: null, referenz: null }));
    expect(r.gebucht).toBe(13);
    const roh = t.db.select().from(buchungen).all()
      .map((x) => ({ lagerortId: x.lagerortId, menge: x.menge }));
    expect(bestandProLagerort(roh, HANDLAGER_ID)).toBe(0);
  });

  it("bucht bei leerem Lagerort GAR NICHTS", () => {
    const vorher = t.db.select().from(buchungen).all().length;
    const r = inTx((tx) => fefoAbbuchung(tx, {
      artikelId: "a1", menge: 5, lagerortId: "gibtsnicht",
      quelle: QUELLE, kommentar: null, referenz: null }));
    expect(r).toEqual({ gebucht: 0, teile: [] });
    expect(t.db.select().from(buchungen).all()).toHaveLength(vorher);
  });
});

describe("fefoAbbuchung — die geschriebenen Zeilen", () => {
  it("schreibt JE CHARGE eine Zeile mit NEGATIVER Menge und dem gewaehlten Typ", () => {
    inTx((tx) => fefoAbbuchung(tx, {
      artikelId: "a1", menge: 5, quelle: QUELLE,
      kommentar: "Entnahme Bereitschaft", referenz: "check:abc", typ: "korrektur" }));
    const neu = t.db.select().from(buchungen).all().filter((b) => b.menge < 0);
    expect(neu).toHaveLength(2);
    for (const b of neu) {
      expect(b.typ).toBe("korrektur");
      expect(b.lagerortId).toBe(HANDLAGER_ID);
      expect(b.referenz).toBe("check:abc");
      expect(b.kommentar).toBe("Entnahme Bereitschaft");
      expect(b.quelleTyp).toBe("system");
    }
    expect(neu.map((b) => b.menge).sort((x, y) => x - y)).toEqual([-3, -2]);
  });

  it("hat den Vorgabetyp 'entnahme'", () => {
    inTx((tx) => fefoAbbuchung(tx, {
      artikelId: "a1", menge: 1, quelle: QUELLE, kommentar: null, referenz: null }));
    expect(t.db.select().from(buchungen).all().find((b) => b.menge < 0)!.typ).toBe("entnahme");
  });
});
