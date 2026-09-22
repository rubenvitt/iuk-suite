import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { and, eq, gt } from "drizzle-orm";
import { migrierteTestDb, type TestDb } from "../../_db/testdb";
import { artikel, buchungen, chargen, lagerorte, newId } from "../../_db/schema";
import { umlagerungAusBereich, umlagerungVonOrt } from "./umlagerung";
import type { Quelle } from "./abbuchung";
import { bestandProLagerort } from "../domain/bestand";
import { handlagerOrte } from "../lesepfade/orte";
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
    inTx((tx) => umlagerungAusBereich(tx, {
      artikelId: "a1", menge: 5, vonBereich: handlagerOrte(tx), nachLagerortId: "rtw-1",
      quelle: QUELLE, kommentar: null, referenz: "check:abc" }));
    expect(summe()).toBe(vorher);
  });

  it("verschiebt den Bestand vollstaendig zwischen den Lagerorten", () => {
    inTx((tx) => umlagerungAusBereich(tx, {
      artikelId: "a1", menge: 5, vonBereich: handlagerOrte(tx), nachLagerortId: "rtw-1",
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
    const r = inTx((tx) => umlagerungAusBereich(tx, {
      artikelId: "a1", menge: 100, vonBereich: handlagerOrte(tx), nachLagerortId: "rtw-1",
      quelle: QUELLE, kommentar: null, referenz: "check:abc" }));
    expect(r.umgelagert).toBe(7);
    expect(summe()).toBe(vorher);
    const roh = alleZeilen().map((b) => ({ lagerortId: b.lagerortId, menge: b.menge }));
    expect(bestandProLagerort(roh, HANDLAGER_ID)).toBe(0);
    expect(bestandProLagerort(roh, "rtw-1")).toBe(7);
  });

  it("schreibt bei LEERER Quelle GAR KEINE Zeile", () => {
    const vorher = alleZeilen().length;
    const r = inTx((tx) => umlagerungVonOrt(tx, {
      artikelId: "a1", menge: 5, vonOrt: "rtw-1", nachLagerortId: HANDLAGER_ID,
      quelle: QUELLE, kommentar: null, referenz: "check:abc" }));
    expect(r).toEqual({ umgelagert: 0, teile: [] });
    expect(alleZeilen()).toHaveLength(vorher);
  });
});

describe("umlagerung — die chargeId und der Typ", () => {
  it("erhaelt die chargeId je Teil — die Verfall-Provenienz wandert mit", () => {
    inTx((tx) => umlagerungAusBereich(tx, {
      artikelId: "a1", menge: 5, vonBereich: handlagerOrte(tx), nachLagerortId: "rtw-1",
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
    inTx((tx) => umlagerungAusBereich(tx, {
      artikelId: "a1", menge: 5, vonBereich: handlagerOrte(tx), nachLagerortId: "rtw-1",
      quelle: QUELLE, kommentar: null, referenz: "check:abc" }));
    const neu = alleZeilen().filter((b) => b.referenz === "check:abc");
    expect(neu).toHaveLength(4);
    for (const b of neu) expect(b.typ).toBe("umlagerung");
  });

  it("traegt Referenz, Kommentar und Quelle auf BEIDEN Legs", () => {
    inTx((tx) => umlagerungAusBereich(tx, {
      artikelId: "a1", menge: 3, vonBereich: handlagerOrte(tx), nachLagerortId: "rtw-1",
      quelle: QUELLE, kommentar: "Nachfüllung", referenz: "check:xyz" }));
    for (const b of alleZeilen().filter((x) => x.referenz === "check:xyz")) {
      expect(b.kommentar).toBe("Nachfüllung");
      expect(b.quelleTyp).toBe("token");
      expect(b.quelleId).toBe("111-111");
    }
  });
});

describe("DRK-297 — die Quelle ist ein Bereich, das Ziel bleibt EIN Ort", () => {
  // EIGENER Artikel: `a1` traegt schon c-frueh/c-spaet am Handlager und wuerde
  // die FEFO-Reihenfolge dieses Blocks verfaelschen.
  beforeEach(() => {
    t.db.insert(artikel).values(
      { id: "a2", name: "Schrank-Artikel", einheit: "Stk.", fach: "S1",
        mindestbestand: 0, aktiv: true, createdAt: NOW }).run();
    t.db.insert(lagerorte).values(
      { id: "schrank-1", name: "Schrank 1", typ: "lager", kennung: null,
        aktiv: true, parentId: HANDLAGER_ID, sortierung: 10 }).run();
    t.db.insert(chargen).values(
      { id: "c-schrank", artikelId: "a2", chargenNr: "SCH", verfall: "2027-06", createdAt: NOW }).run();
    t.db.insert(buchungen).values({
      id: newId(), ts: NOW, typ: "zugang", artikelId: "a2", chargeId: "c-schrank",
      lagerortId: "schrank-1", menge: 12, quelleTyp: "system", quelleId: "t",
      referenz: null, kommentar: null,
    }).run();
  });

  /** ⚠️ DIE GEFAEHRLICHSTE ZEILE DES UMBAUS: das Ziel-Leg darf NIE den
   *  Quellort nehmen. Sonst ist die Umlagerung netto null, wirft nicht — und
   *  das Fahrzeug bleibt leer. */
  it("die Umlagerung schreibt die Gutschrift ans Ziel, nicht in den Quellschrank", () => {
    const ergebnis = inTx((tx) => umlagerungAusBereich(tx, {
      artikelId: "a2", menge: 4, vonBereich: handlagerOrte(tx), nachLagerortId: "rtw-1",
      quelle: QUELLE, kommentar: null, referenz: "check:schrank" }));
    expect(ergebnis.umgelagert).toBe(4);
    const amZiel = t.db.select().from(buchungen)
      .where(and(eq(buchungen.lagerortId, "rtw-1"), gt(buchungen.menge, 0))).all();
    expect(amZiel.reduce((s, b) => s + b.menge, 0)).toBe(4);
    const imSchrank = t.db.select().from(buchungen)
      .where(eq(buchungen.lagerortId, "schrank-1")).all()
      .reduce((s, b) => s + b.menge, 0);
    expect(imSchrank).toBe(8); // 12 − 4
  });
});

/**
 * DRK-338 — `chargeId` schraenkt die Verteilung auf GENAU EINE Charge ein.
 *
 * Die Vorrichtung des Dateikopfs traegt den Fall schon: `c-frueh` (2026-07)
 * und `c-spaet` (2028-01), beide im Handlager. FEFO griffe zur frueheren; beim
 * UMRAEUMEN ist das falsch — gewandert ist die, die jemand in der Hand hatte.
 *
 * ⚠️ DER AUSFALL WAERE STILL: Netto bleibt null (beide Legs kommen aus
 * `teile[]`), die Handlager-Summe stimmt, und nur die Ortsangabe je Charge ist
 * falsch. Das Journal ist append-only — heilbar ist das nicht.
 */
describe("umlagerung — DRK-338: die gewaehlte Charge", () => {
  it("bucht ausschliesslich die genannte Charge, auch wenn eine aeltere daliegt", () => {
    const ergebnis = inTx((tx) => umlagerungAusBereich(tx, {
      artikelId: "a1", menge: 4, vonBereich: handlagerOrte(tx), nachLagerortId: "rtw-1",
      chargeId: "c-spaet", quelle: QUELLE, kommentar: null,
      referenz: "umlagerung:rtw-1" }));
    expect(ergebnis.umgelagert).toBe(4);
    expect(ergebnis.teile.map((t2) => t2.chargeId)).toEqual(["c-spaet"]);

    const amZiel = alleZeilen().filter((b) => b.lagerortId === "rtw-1");
    expect(amZiel).toHaveLength(1);
    expect(amZiel[0]!.chargeId).toBe("c-spaet");
    // Die frueher verfallende Charge wurde NICHT angefasst.
    const frueh = alleZeilen().filter((b) => b.chargeId === "c-frueh")
      .reduce((s, b) => s + b.menge, 0);
    expect(frueh).toBe(3);
  });

  it("kappt an der gewaehlten Charge, statt auf eine andere auszuweichen", () => {
    // 3 Stueck `c-frueh` liegen da, 5 sind angefordert — `c-spaet` daneben
    // haette genug. Ohne die Einschraenkung kaemen 5 heraus.
    const ergebnis = inTx((tx) => umlagerungAusBereich(tx, {
      artikelId: "a1", menge: 5, vonBereich: handlagerOrte(tx), nachLagerortId: "rtw-1",
      chargeId: "c-frueh", quelle: QUELLE, kommentar: null,
      referenz: "umlagerung:rtw-1" }));
    expect(ergebnis.umgelagert).toBe(3);
    expect(summe()).toBe(7);   // Netto null bleibt
  });

  /** Ohne `chargeId` bleibt es bei FEFO — der Weg von `check:` und
   *  `entnahme-ziel:`, wo die Nachfuellung die aelteste Charge nehmen SOLL. */
  it("laeuft ohne chargeId unveraendert nach FEFO", () => {
    const ergebnis = inTx((tx) => umlagerungAusBereich(tx, {
      artikelId: "a1", menge: 3, vonBereich: handlagerOrte(tx), nachLagerortId: "rtw-1",
      quelle: QUELLE, kommentar: null, referenz: "check:abc" }));
    expect(ergebnis.teile.map((t2) => t2.chargeId)).toEqual(["c-frueh"]);
  });
});

describe("umlagerung — DRK-404: eine andere Zielcharge", () => {
  it("bucht das Ziel-Leg auf `nachChargeId`, die Quelle auf die gewaehlte — netto je Artikel null", () => {
    inTx((tx) => umlagerungAusBereich(tx, {
      artikelId: "a1", menge: 2, vonBereich: handlagerOrte(tx), nachLagerortId: "rtw-1",
      chargeId: "c-frueh", nachChargeId: "c-spaet", quelle: QUELLE, kommentar: null,
      referenz: "einraeumen:rtw-1" }));
    const neu = alleZeilen().filter((b) => b.referenz === "einraeumen:rtw-1");
    expect(neu.map((b) => [b.lagerortId, b.chargeId, b.menge])).toEqual(expect.arrayContaining([
      [HANDLAGER_ID, "c-frueh", -2], ["rtw-1", "c-spaet", 2],
    ]));
    expect(summe()).toBe(7);
  });

  it("wirft ohne feste Quellcharge — welche FEFO-Charge ersetzt wuerde, waere geraten", () => {
    expect(() => inTx((tx) => umlagerungAusBereich(tx, {
      artikelId: "a1", menge: 2, vonBereich: handlagerOrte(tx), nachLagerortId: "rtw-1",
      nachChargeId: "c-spaet", quelle: QUELLE, kommentar: null, referenz: "x" }))).toThrow();
    expect(alleZeilen().filter((b) => b.referenz === "x")).toEqual([]);
  });
});

describe("umlagerung — EIN Zeitstempel je Vorgang", () => {
  /*
   * ⚠️ DIE UHR TICKT IM TEST, UND DAS IST DER GANZE TEST (Codex-Review zu
   * PR #175). `new Date()` IN der Einfuegeschleife las sie je Charge neu — eine
   * FEFO-Umlagerung ueber zwei Chargen, die eine Sekundengrenze ueberquert,
   * bekam zwei verschiedene `ts`. Wer die Legs eines Vorgangs anhand von
   * Referenz UND Zeitpunkt zusammenfasst, saehe dann zwei Vorgaenge, wo einer
   * war (`lesepfade/entnahmebox.ts`).
   *
   * ⚠️ OHNE DIESE ATTRAPPE WAERE DER TEST WERTLOS — und zwar gruen: zwei
   * `new Date()` hintereinander liefern in derselben Millisekunde dieselbe
   * Zahl, und der Fehler haengt genau daran, WO die Uhr steht. Eine Zusicherung,
   * die nur bei ungluecklichem Timing faellt, ist keine.
   */
  let echtesDatum: DateConstructor;

  beforeEach(() => {
    echtesDatum = globalThis.Date;
    let schritt = 0;
    class TickendesDatum extends echtesDatum {
      constructor(...args: unknown[]) {
        if (args.length === 0) {
          super(NOW.getTime() + schritt++ * 1000);
          return;
        }
        // @ts-expect-error Die Ueberladungen von `Date` lassen sich nicht
        // typseitig weiterreichen; jeder Aufruf MIT Argumenten (Drizzle liest
        // so die gespeicherten Zeitpunkte zurueck) geht unveraendert durch.
        super(...args);
      }
    }
    globalThis.Date = TickendesDatum as unknown as DateConstructor;
  });

  afterEach(() => { globalThis.Date = echtesDatum; });

  it("schreibt alle Zugangs-Legs einer FEFO-Umlagerung mit DEMSELBEN ts", () => {
    // 5 Stueck ueber zwei Chargen: 3 aus `c-frueh`, 2 aus `c-spaet`.
    const ergebnis = inTx((tx) => umlagerungAusBereich(tx, {
      artikelId: "a1", menge: 5, vonBereich: handlagerOrte(tx), nachLagerortId: "rtw-1",
      quelle: QUELLE, kommentar: null, referenz: "entnahmebox:rtw-1" }));
    expect(ergebnis.teile, "Vorbedingung: der Vorgang geht ueber ZWEI Chargen")
      .toHaveLength(2);

    const zugaenge = t.db.select().from(buchungen)
      .where(and(eq(buchungen.lagerortId, "rtw-1"), gt(buchungen.menge, 0))).all();
    expect(zugaenge).toHaveLength(2);
    expect(new Set(zugaenge.map((b) => b.ts.getTime())).size).toBe(1);
  });

  it("schreibt auch die Abgangs-Legs mit DEMSELBEN ts", () => {
    // Dieselbe Falle eine Ebene tiefer, in `fefoAbbuchungImBereich` — und derselbe Fix.
    inTx((tx) => umlagerungAusBereich(tx, {
      artikelId: "a1", menge: 5, vonBereich: handlagerOrte(tx), nachLagerortId: "rtw-1",
      quelle: QUELLE, kommentar: null, referenz: "entnahmebox:rtw-1" }));

    const abgaenge = alleZeilen()
      .filter((b) => b.referenz === "entnahmebox:rtw-1" && b.menge < 0);
    expect(abgaenge).toHaveLength(2);
    expect(new Set(abgaenge.map((b) => b.ts.getTime())).size).toBe(1);
  });
});
