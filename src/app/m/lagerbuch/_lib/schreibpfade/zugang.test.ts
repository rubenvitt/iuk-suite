import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { migrierteTestDb, type TestDb } from "../../_db/testdb";
import { artikel, buchungen, chargen, lagerorte } from "../../_db/schema";
import { zugangBuchen } from "./zugang";
import { BuchungAbgewiesen } from "../buchungAbgewiesen";
import type { Quelle } from "./abbuchung";
import { HANDLAGER_ID } from "../konstanten";

/**
 * DER ZUGANG ALS SCHREIBPFAD — die LETZTE Bank, nicht die erste.
 *
 * ⚠️ WARUM ES DIESE DATEI GIBT, obwohl `_actions/buchung.test.ts` beide
 * Zugangswege bereits durchmisst: dort wird die Lage VOR der Transaktion
 * abgefangen und als Satz beantwortet. Diese Pruefung hier faellt damit in den
 * Schatten der Actions — sie liefe nie, und ihr Wegfall waere GRUEN. Genau das
 * ist aber der Fall, gegen den sie gebaut ist: eine manipulierte Nutzlast und
 * jeder DRITTE Aufrufer, der morgen dazukommt und den Vorcheck vergisst.
 * Aufgerufen wird deshalb direkt, ohne Action davor.
 *
 * ⚠️ DIE VIERTE INVARIANTE IST DIE JUENGSTE (DRK-380) und die einzige, die eine
 * RICHTUNG festlegt statt einer Sperre: auf einen deaktivierten Artikel geht
 * kein Material mehr ZU, sein Bestand laesst sich aber weiter abbuchen. Die
 * Gegenrichtung haengt in `_actions/buchung.test.ts`, weil sie andere
 * Schreibpfade betrifft (`abbuchung`, `umlagerung`).
 */
const NOW = new Date("2026-06-15T10:00:00Z");
const QUELLE: Quelle = { quelleTyp: "oidc", quelleId: "u-admin" };
let t: TestDb;

beforeEach(() => {
  t = migrierteTestDb("lagerbuch-sp-zugang-");
  t.db.insert(lagerorte).values([
    { id: "schrank-1", name: "Schrank 1", typ: "lager", parentId: HANDLAGER_ID, aktiv: true },
  ]).run();
  t.db.insert(artikel).values([
    { id: "a-aktiv", name: "Mullbinde", einheit: "Stk.", fach: "A-01",
      mindestbestand: 0, aktiv: true, createdAt: NOW },
    { id: "a-inaktiv", name: "Altverband", einheit: "Stk.", fach: "A-09",
      mindestbestand: 0, aktiv: false, createdAt: NOW },
  ]).run();
  t.db.insert(chargen).values([
    { id: "c-aktiv", artikelId: "a-aktiv", chargenNr: "L1", verfall: "2028-01", createdAt: NOW },
    { id: "c-inaktiv", artikelId: "a-inaktiv", chargenNr: "L9", verfall: "2028-01",
      createdAt: NOW },
  ]).run();
});
afterEach(() => t.schliessen());

const zeilen = () => t.db.select().from(buchungen).all();

/**
 * ⚠️ DER AUFRUF STEHT IN EINER ECHTEN TRANSAKTION, nicht auf `t.db` direkt.
 * `zugangBuchen` ist transaktionsFREI (Festlegung H3) — es erwartet ein `tx`,
 * und nur darin rollt ein Wurf die halb geschriebene Charge zurueck. Ein Test
 * ohne Transaktion pruefte eine Bauform, die es nicht gibt.
 */
function inTx<T>(fn: (tx: Parameters<Parameters<typeof t.db.transaction>[0]>[0]) => T): T {
  return t.db.transaction((tx) => fn(tx));
}

function bucheAuf(artikelId: string, chargeId: string) {
  return inTx((tx) =>
    zugangBuchen(tx, {
      artikelId, menge: 5, lagerortId: "schrank-1",
      charge: { art: "vorhanden", chargeId },
      quelle: QUELLE, kommentar: null, referenz: null,
    }));
}

describe("zugangBuchen — der Artikel muss aktiv sein (DRK-380)", () => {
  it("bucht auf einen AKTIVEN Artikel — die Gegenprobe zur Sperre", () => {
    expect(bucheAuf("a-aktiv", "c-aktiv").chargeId).toBe("c-aktiv");
    expect(zeilen()).toHaveLength(1);
    expect(zeilen()[0]).toMatchObject({ typ: "zugang", artikelId: "a-aktiv", menge: 5 });
  });

  it("wirft auf einem DEAKTIVIERTEN Artikel und schreibt keine Zeile", () => {
    // ⚠️ DIE KLASSE GEHOERT ZUR ZUSAGE (DRK-193): nur `BuchungAbgewiesen`
    // reicht `bucheZugang`s `catch` auf den Schirm durch. Ein gewoehnliches
    // `Error` verschwaende den Satz still hinter dem Rueckfall.
    expect(() => bucheAuf("a-inaktiv", "c-inaktiv")).toThrow(BuchungAbgewiesen);
    expect(() => bucheAuf("a-inaktiv", "c-inaktiv")).toThrow(/deaktiviert/);
    expect(zeilen()).toEqual([]);
  });

  /**
   * ⚠️ EIN FEHLENDER ARTIKEL GEHT DURCH DIESE PRUEFUNG HINDURCH, und das ist
   * die Grenze, auf die es ankommt. Der kuerzere Ausdruck `!stamm?.aktiv`
   * faenge ihn mit ab — und schickte damit jemanden in die Verwaltung, um
   * einen Schalter an einer Zeile umzulegen, die es nicht mehr gibt.
   *
   * Sein Weg ist seit DRK-193 ein anderer und ein geklaerter: er scheitert am
   * Fremdschluessel, das ist ein TREIBERfehler, und der gehoert hinter den
   * Rueckfallsatz statt auf die Arbeitsflaeche. Zugesichert wird deshalb die
   * KLASSE, nicht nur der Text: ein `BuchungAbgewiesen` traege den Treibertext
   * ungefiltert auf den Schirm.
   */
  it("laesst einen fehlenden Artikel am Treiber scheitern, nicht an dieser Pruefung", () => {
    let gefangen: unknown;
    try {
      inTx((tx) =>
        zugangBuchen(tx, {
          artikelId: "gibt-es-nicht", menge: 1, lagerortId: HANDLAGER_ID,
          charge: { art: "neu", chargenNr: "L-NEU", verfall: "2028-01" },
          quelle: QUELLE, kommentar: null, referenz: null,
        }));
    } catch (e) {
      gefangen = e;
    }
    expect(gefangen).toBeInstanceOf(Error);
    expect(gefangen).not.toBeInstanceOf(BuchungAbgewiesen);
    expect((gefangen as Error).message).not.toMatch(/deaktiviert/);
    expect(zeilen()).toEqual([]);
  });

  /**
   * ⚠️ DIE PRUEFUNG STEHT VOR DEM ANLEGEN DER CHARGE. Der Rollback der
   * Transaktion raeumte die Zeile zwar ohnehin weg; die Reihenfolge haengt dann
   * aber an der Transaktionsgrenze statt an dieser Datei — und ein Aufrufer,
   * der `zugangBuchen` je ohne `tx` benutzte, hinterliesse ein Los, auf dem nie
   * etwas lag.
   */
  it("legt bei der Abweisung keine neue Charge an", () => {
    expect(() =>
      inTx((tx) =>
        zugangBuchen(tx, {
          artikelId: "a-inaktiv", menge: 1, lagerortId: "schrank-1",
          charge: { art: "neu", chargenNr: "L-NEU", verfall: "2028-01" },
          quelle: QUELLE, kommentar: null, referenz: null,
        }))).toThrow(/deaktiviert/);
    expect(t.db.select().from(chargen).where(eq(chargen.chargenNr, "L-NEU")).get())
      .toBeUndefined();
  });

  /**
   * ⚠️ DIE BESTELLT-MARKIERUNG BLEIBT STEHEN. Sie ist die zweite, stillere
   * Haelfte: `zugangBuchen` nullt sie am Ende (§5.5), und eine Abweisung, die
   * sie trotzdem loeschte, naehme die Position dauerhaft aus der Bestelliste —
   * ohne dass je Ware angekommen waere.
   */
  it("laesst die Bestellt-Markierung unberuehrt, wenn es abweist", () => {
    t.db.update(artikel).set({ bestelltAt: NOW }).where(eq(artikel.id, "a-inaktiv")).run();
    expect(() => bucheAuf("a-inaktiv", "c-inaktiv")).toThrow(/deaktiviert/);
    expect(t.db.select().from(artikel).where(eq(artikel.id, "a-inaktiv")).get()?.bestelltAt)
      .not.toBeNull();
  });
});
