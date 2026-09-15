import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { and, eq, lt } from "drizzle-orm";
import { migrierteTestDb, type TestDb } from "../../_db/testdb";
import { artikel, buchungen, chargen, lagerorte, newId } from "../../_db/schema";
import { fefoAbbuchung, type Quelle } from "./abbuchung";
import { handlagerOrte } from "../lesepfade/orte";
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
    expect(r.teile).toEqual([{ chargeId: "c-frueh", menge: 3, vonLagerortId: HANDLAGER_ID }, { chargeId: "c-spaet", menge: 2, vonLagerortId: HANDLAGER_ID }]);
  });

  it("sieht den FAHRZEUG-Bestand derselben Charge NICHT", () => {
    /**
     * ⚠️ DIE ZEILE, UM DIE ES GEHT. `abbuchung.ts:38` laedt heute alle Buchungen
     * des Artikels OHNE Lagerort-Praedikat. Ohne das Scoping saehe die Abbuchung
     * fuer `c-frueh` einen Rest von 8 (3 Handlager + 5 Fahrzeug) statt 3 — bei
     * einer angeforderten Menge von 4 naehme sie ALLE 4 aus `c-frueh`, statt nach
     * 3 auf `c-spaet` ueberzulaufen. Der Handlager-Bestand von `c-frueh` (real 3)
     * wuerde dabei auf -1 gedrueckt (I2 gebrochen).
     */
    const r = inTx((tx) => fefoAbbuchung(tx, {
      artikelId: "a1", menge: 4, quelle: QUELLE, kommentar: null, referenz: null }));
    expect(r.teile).toEqual([{ chargeId: "c-frueh", menge: 3, vonLagerortId: HANDLAGER_ID }, { chargeId: "c-spaet", menge: 1, vonLagerortId: HANDLAGER_ID }]);
    const roh = t.db.select().from(buchungen).all()
      .map((x) => ({ lagerortId: x.lagerortId, menge: x.menge }));
    expect(bestandProLagerort(roh, HANDLAGER_ID)).toBe(9);
    expect(bestandProLagerort(roh, "rtw-1")).toBe(5);
  });

  it("bucht auf Wunsch von einem ANDEREN Lagerort ab", () => {
    const r = inTx((tx) => fefoAbbuchung(tx, {
      artikelId: "a1", menge: 99, orte: ["rtw-1"],
      quelle: QUELLE, kommentar: null, referenz: null }));
    expect(r).toEqual({ gebucht: 5, teile: [{ chargeId: "c-frueh", menge: 5, vonLagerortId: "rtw-1" }] });
  });
});

describe("DRK-297 — Abbuchung ueber den Handlager-Bereich", () => {
  // EIGENER Artikel: `a1` traegt bereits c-frueh/c-spaet am Handlager und
  // wuerde die FEFO-Reihenfolge dieses Blocks verfaelschen (c-frueh liegt VOR
  // c-schrank und haette an der Wurzel selbst Bestand).
  beforeEach(() => {
    t.db.insert(artikel).values(
      { id: "a-schrank", name: "Schrank-Artikel", einheit: "Stk.", fach: "S1",
        mindestbestand: 0, aktiv: true, createdAt: NOW }).run();
    // Ein Schrank UNTERHALB der Handlager-Wurzel — der Bereich, den
    // `handlagerOrte` liefert. Bestand liegt hier AUSSCHLIESSLICH im Schrank.
    t.db.insert(lagerorte).values(
      { id: "schrank-1", name: "Schrank 1", typ: "lager", kennung: null,
        aktiv: true, parentId: HANDLAGER_ID, sortierung: 10 }).run();
    t.db.insert(chargen).values(
      { id: "c-schrank", artikelId: "a-schrank", chargenNr: "SCH", verfall: "2027-06", createdAt: NOW }).run();
    t.db.insert(buchungen).values({
      id: newId(), ts: NOW, typ: "zugang", artikelId: "a-schrank", chargeId: "c-schrank",
      lagerortId: "schrank-1", menge: 12, quelleTyp: "system", quelleId: "t",
      referenz: null, kommentar: null,
    }).run();
  });

  /** DER BEFUND AUS DEM TICKET: 12 Stueck im Schrank, Entnahme ueber den
   *  Handlager. Vor dieser Aenderung: `gebucht: 0`, ohne Fehler — die Abfrage
   *  suchte ausschliesslich an der Wurzel. */
  it("nimmt Bestand aus einem Schrank, nicht nur von der Wurzel", () => {
    const ergebnis = inTx((tx) => fefoAbbuchung(tx, {
      artikelId: "a-schrank", menge: 3, orte: handlagerOrte(tx),
      quelle: QUELLE, kommentar: null, referenz: null }));
    expect(ergebnis.gebucht).toBe(3);
    expect(ergebnis.teile[0]?.vonLagerortId).toBe("schrank-1");
  });

  it("die Buchung traegt den Schrank, nicht die Wurzel", () => {
    inTx((tx) => fefoAbbuchung(tx, {
      artikelId: "a-schrank", menge: 3, orte: handlagerOrte(tx),
      quelle: QUELLE, kommentar: null, referenz: null }));
    const abgang = t.db.select().from(buchungen)
      .where(and(eq(buchungen.artikelId, "a-schrank"), lt(buchungen.menge, 0))).all();
    expect(abgang.map((b) => b.lagerortId)).toEqual(["schrank-1"]);
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
      artikelId: "a1", menge: 5, orte: ["gibtsnicht"],
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
