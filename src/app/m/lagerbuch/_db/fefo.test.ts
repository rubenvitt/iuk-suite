import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { migrierteTestDb, type TestDb } from "./testdb";
import { artikel, buchungen, chargen, newId } from "./schema";
import { fefoAbbuchung } from "../_lib/schreibpfade/abbuchung";
import { HANDLAGER_ID } from "../_lib/konstanten";

/**
 * DER DETERMINISMUS-TEST AUS §5.3.1 — gegen eine ECHTE Verbindung.
 *
 * Der Unit-Test in `_lib/domain/fefo.test.ts` sortiert ein JS-Array, dessen
 * AUSGANGSREIHENFOLGE der Test selbst setzt. Ob die Ordnung auch dann gilt, wenn
 * die Zeilen aus einer echten Verbindung kommen, kann nur DIESE Datei sagen —
 * denn genau die Rueckgabereihenfolge der Datenbank ist es, die heute
 * entscheidet, und sie ist kein Vertrag.
 */
const NOW = new Date("2026-06-15T10:00:00Z");
let t: TestDb;

beforeEach(() => {
  t = migrierteTestDb("lagerbuch-fefo-");
  t.db.insert(artikel).values(
    { id: "a1", name: "Verband", einheit: "Stk.", fach: "A1",
      mindestbestand: 0, aktiv: true, createdAt: NOW }).run();
});
afterEach(() => t.schliessen());

function chargeMitBestand(id: string, verfall: string, createdAt: Date, menge: number) {
  t.db.insert(chargen).values(
    { id, artikelId: "a1", chargenNr: id, verfall, createdAt }).run();
  t.db.insert(buchungen).values(
    { id: newId(), ts: NOW, typ: "zugang", artikelId: "a1", chargeId: id,
      lagerortId: HANDLAGER_ID, menge, quelleTyp: "system", quelleId: "t",
      referenz: null, kommentar: null }).run();
}

describe("gleicher Verfall — die AELTERE Charge wird zuerst verbraucht", () => {
  it("entscheidet ueber createdAt, nicht ueber die DB-Reihenfolge", () => {
    /**
     * ⚠️ DIE MUTATION, DIE DAS FAENGT (§5.19.3, Zeile 1): die Zweitsortierung in
     * `fefoVerteilung` entfernen. Ohne sie entscheidet die Rueckgabereihenfolge
     * der Datenbank, und die ist kein Vertrag: sie kann sich mit einem Index, mit
     * einer SQLite-Fassung oder mit dem naechsten VACUUM aendern.
     *
     * ⚠️ DIE IDs SIND ABSICHTLICH GEGENLAEUFIG ZUR CHARGENID-ORDNUNG GEWAEHLT:
     * "aaa" ist die JUENGERE Charge und wird ZUERST eingefuegt, "zzz" ist die
     * AELTERE. Sowohl die Einfuegereihenfolge (und damit die naive
     * DB-Rueckgabereihenfolge) als auch die dritte Sortierstufe (`chargeId`,
     * "aaa" < "zzz") wuerden "aaa" zuerst liefern — nur die zweite Stufe
     * (`createdAt`) liefert die fachlich korrekte Reihenfolge "zzz" zuerst.
     * Mit den vorigen IDs ("c-neu"/"c-alt") haette schon die `chargeId`-Stufe
     * allein dasselbe Ergebnis erzeugt ("c-alt" < "c-neu") — der Test haette die
     * zweite Stufe gar nicht isoliert geprueft.
     */
    chargeMitBestand("aaa", "2026-07", new Date("2026-02-01T00:00:00Z"), 5);
    chargeMitBestand("zzz", "2026-07", new Date("2026-01-01T00:00:00Z"), 5);
    const r = t.db.transaction((tx) => fefoAbbuchung(tx, {
      artikelId: "a1", menge: 7, quelle: { quelleTyp: "system", quelleId: "t" },
      kommentar: null, referenz: null }));
    expect(r.teile).toEqual([{ chargeId: "zzz", menge: 5 }, { chargeId: "aaa", menge: 2 }]);
  });

  it("entscheidet bei gleicher createdAt ueber die chargeId", () => {
    // `createdAt` sind UNIX-SEKUNDEN: ein CSV-Import legt Dutzende Chargen in
    // DERSELBEN Sekunde an. Ohne die dritte Stufe waere die Ordnung dort wieder
    // unbestimmt.
    const gleich = new Date("2026-01-01T00:00:00Z");
    chargeMitBestand("zzz", "2026-07", gleich, 2);
    chargeMitBestand("aaa", "2026-07", gleich, 2);
    const r = t.db.transaction((tx) => fefoAbbuchung(tx, {
      artikelId: "a1", menge: 3, quelle: { quelleTyp: "system", quelleId: "t" },
      kommentar: null, referenz: null }));
    expect(r.teile).toEqual([{ chargeId: "aaa", menge: 2 }, { chargeId: "zzz", menge: 1 }]);
  });

  it("liefert bei ZWEI identischen Laeufen dieselbe Verteilung", () => {
    const gleich = new Date("2026-01-01T00:00:00Z");
    chargeMitBestand("b", "2026-07", gleich, 4);
    chargeMitBestand("a", "2026-07", gleich, 4);
    const lauf = () => t.db.transaction((tx) => {
      const r = fefoAbbuchung(tx, {
        artikelId: "a1", menge: 2, quelle: { quelleTyp: "system", quelleId: "t" },
        kommentar: null, referenz: null });
      // Zuruecksetzen ist unmoeglich (Append-only) — deshalb wird die zweite
      // Runde gegen den verbleibenden Rest gefahren und nur die REIHENFOLGE
      // verglichen.
      return r.teile.map((x) => x.chargeId);
    });
    expect(lauf()).toEqual(["a"]);
    expect(lauf()).toEqual(["a"]);
  });
});
