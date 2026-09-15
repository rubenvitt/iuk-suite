import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { migrierteTestDb, type TestDb } from "./testdb";
import { artikel, buchungen, chargen, lagerorte, newId } from "./schema";
import { fefoAbbuchung } from "../_lib/schreibpfade/abbuchung";
import { handlagerOrte } from "../_lib/lesepfade/orte";
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

describe("verschiedener Verfall — die frueher ablaufende Charge zuerst", () => {
  it("entscheidet ZUERST ueber den Verfall, gegen createdAt UND chargeId", () => {
    /**
     * ⚠️ DIE STUFE, DIE IN DIESER DATEI FEHLTE (I-11). Der Dateikopf sagt, nur
     * hier lasse sich belegen, dass die Ordnung auch gilt, wenn die Zeilen aus
     * der Datenbank kommen — `verfall` variierte aber in KEINEM der drei Faelle
     * (ueberall "2026-07"). Der einzige DB-Kandidat fuer Stufe 1 war
     * `abbuchung.test.ts:41`, und dort liegen beide Chargen auf derselben
     * `createdAt` bei "c-frueh" < "c-spaet": die Sollreihenfolge kaeme dort auch
     * nach Streichen des `verfall`-Terms heraus. Fuer Stufe 1 war die
     * DB-Abdeckung damit eine echte Teilmenge der Unit-Abdeckung — genau das,
     * was die Abnahmezeile („Unit-Test und DB-Test fangen VERSCHIEDENE Faelle")
     * ausschliessen soll.
     *
     * DIE GEWINNERIN VERLIERT IN BEIDEN NACHRANGIGEN SCHLUESSELN:
     *   "aaa"  verfall 2026-09 · createdAt 2026-01-01 (AELTER)  · id kleiner
     *   "zzz"  verfall 2026-07 · createdAt 2026-03-01 (juenger) · id groesser
     * `createdAt` ↑ waehlte "aaa", `chargeId` ↑ waehlte "aaa" — nur der
     * frueheste Verfall waehlt "zzz". "aaa" wird zudem ZUERST eingefuegt, die
     * naive DB-Rueckgabereihenfolge liefert sie also ebenfalls vorn.
     */
    chargeMitBestand("aaa", "2026-09", new Date("2026-01-01T00:00:00Z"), 5);
    chargeMitBestand("zzz", "2026-07", new Date("2026-03-01T00:00:00Z"), 5);
    const r = t.db.transaction((tx) => fefoAbbuchung(tx, {
      artikelId: "a1", menge: 7, quelle: { quelleTyp: "system", quelleId: "t" },
      kommentar: null, referenz: null }));
    expect(r.teile).toEqual([{ chargeId: "zzz", menge: 5, vonLagerortId: HANDLAGER_ID }, { chargeId: "aaa", menge: 2, vonLagerortId: HANDLAGER_ID }]);
  });
});

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
    expect(r.teile).toEqual([{ chargeId: "zzz", menge: 5, vonLagerortId: HANDLAGER_ID }, { chargeId: "aaa", menge: 2, vonLagerortId: HANDLAGER_ID }]);
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
    expect(r.teile).toEqual([{ chargeId: "aaa", menge: 2, vonLagerortId: HANDLAGER_ID }, { chargeId: "zzz", menge: 1, vonLagerortId: HANDLAGER_ID }]);
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

describe("DRK-297 — der vierte Sortierrang gegen eine ECHTE Verbindung", () => {
  /**
   * FIXRUNDE 1, BEFUND 2. Vor der Bereichs-Umstellung baute `abbuchung.ts`
   * jede `ChargeRest` mit EINEM gemeinsamen Ort — dieselbe Charge konnte nie
   * zweimal in der Liste stehen, `ortSortierung` und `lagerortId` (Raenge 4
   * und 5) waren aus einer echten Verbindung heraus STRUKTURELL unerreichbar.
   * Seit dieser Aufgabe liegt dieselbe Charge an mehreren Orten im Bereich —
   * genau der Fall, den `_lib/domain/fefo.ts` schon als reine Funktion prueft
   * (`_lib/domain/fefo.test.ts`, „der vierte Sortierrang"), hier aber zum
   * ersten Mal ueber eine echte `fefoAbbuchung`-Abfrage.
   *
   * ⚠️ DIE ORTS-IDs SIND ABSICHTLICH GEGENLAEUFIG ZUR SORTIERUNG GEWAEHLT:
   * "z-schrank" hat die KLEINERE `sortierung` (10, fachlich vorn), "a-schrank"
   * die GROESSERE (90, hinten) — alphabetisch ist es umgekehrt. Verschwindet
   * `ortSortierung` aus dem Komparator, entscheidet die dann fuehrende
   * `lagerortId`-Stufe zugunsten von "a-schrank", und dieser Test schlaegt
   * fehl (Muster: `_lib/domain/fefo.test.ts`, „ortSortierung ueberholt die
   * lagerortId-Ordnung nicht").
   */
  it("nimmt vom Schrank mit der kleineren sortierung, auch wenn seine ID alphabetisch hinten steht", () => {
    t.db.insert(lagerorte).values([
      { id: "z-schrank", name: "Z-Schrank", typ: "lager", aktiv: true,
        parentId: HANDLAGER_ID, sortierung: 10 },
      { id: "a-schrank", name: "A-Schrank", typ: "lager", aktiv: true,
        parentId: HANDLAGER_ID, sortierung: 90 },
    ]).run();
    t.db.insert(chargen).values(
      { id: "c1", artikelId: "a1", chargenNr: "c1", verfall: "2027-01", createdAt: NOW }).run();
    for (const [lagerortId, menge] of [["a-schrank", 5], ["z-schrank", 5]] as const) {
      t.db.insert(buchungen).values({
        id: newId(), ts: NOW, typ: "zugang", artikelId: "a1", chargeId: "c1",
        lagerortId, menge, quelleTyp: "system", quelleId: "t", referenz: null, kommentar: null,
      }).run();
    }

    const r = t.db.transaction((tx) => fefoAbbuchung(tx, {
      artikelId: "a1", menge: 3, orte: handlagerOrte(tx),
      quelle: { quelleTyp: "system", quelleId: "t" }, kommentar: null, referenz: null }));

    expect(r.teile).toEqual([{ chargeId: "c1", menge: 3, vonLagerortId: "z-schrank" }]);
  });
});
