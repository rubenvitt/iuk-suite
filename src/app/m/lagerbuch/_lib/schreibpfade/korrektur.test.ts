import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { migrierteTestDb, type TestDb } from "../../_db/testdb";
import { artikel, buchungen, chargen, lagerorte, newId } from "../../_db/schema";
import { korrekturAufLagerort } from "./korrektur";
import type { Quelle } from "./abbuchung";
import { bestandProLagerort } from "../domain/bestand";
import { HANDLAGER_ID, PSEUDO_VERFALL, CHARGE_KORREKTUR, istOhneVerfall } from "../konstanten";

const NOW = new Date("2026-06-15T10:00:00Z");
const QUELLE: Quelle = { quelleTyp: "token", quelleId: "111-111" };
let t: TestDb;

beforeEach(() => {
  t = migrierteTestDb("lagerbuch-sp-korrektur-");
  t.db.insert(lagerorte).values(
    { id: "rtw-1", name: "RTW 1", typ: "fahrzeug", kennung: null, aktiv: true }).run();
  t.db.insert(artikel).values([
    { id: "a1", name: "Verband", einheit: "Stk.", fach: "A1",
      mindestbestand: 0, aktiv: true, createdAt: NOW },
    { id: "a-ohne", name: "Ohne Charge", einheit: "Stk.", fach: "A2",
      mindestbestand: 0, aktiv: true, createdAt: NOW },
    { id: "a-tie", name: "Gleichstand", einheit: "Stk.", fach: "A3",
      mindestbestand: 0, aktiv: true, createdAt: NOW },
  ]).run();
  /**
   * ⚠️ DIE DREI SORTIERSCHLUESSEL STEHEN GEGENEINANDER (T30/T46/T54-Lehre, I-10).
   *
   * Vorher waren `verfall`, `createdAt` und `id` bei c-alt/c-neu GLEICHLAEUFIG:
   * die dritte Stufe (`id` ↓) allein reproduzierte die Sollreihenfolge, und die
   * beiden fachlich tragenden Stufen waren VAKUUM — man konnte sie ersatzlos
   * streichen, ohne dass ein Test rot wurde.
   *
   * Jetzt muss die GEWINNENDE Charge in den NACHRANGIGEN Schluesseln VERLIEREN:
   *   c-neu   verfall 2028-01 (spaetester) · createdAt 2025-01-01 (AELTESTE)
   *   c-alt   verfall 2026-07             · createdAt 2026-01-01 (juenger)
   * `verfall` ↓ waehlt c-neu, `createdAt` ↓ waehlte c-alt — Stufe 1 traegt also
   * allein. (`id` ↓ waehlt „c-neu" > „c-alt", das bleibt gleichlaeufig; die
   * Isolation von Stufe 2 leistet der Fall mit `c-a-jung` weiter unten.)
   */
  t.db.insert(chargen).values([
    { id: "c-alt", artikelId: "a1", chargenNr: "ALT", verfall: "2026-07",
      createdAt: new Date("2026-01-01T00:00:00Z") },
    { id: "c-neu", artikelId: "a1", chargenNr: "NEU", verfall: "2028-01",
      createdAt: new Date("2025-01-01T00:00:00Z") },
  ]).run();
  const b = (chargeId: string, lagerortId: string, menge: number) => ({
    id: newId(), ts: NOW, typ: "zugang" as const, artikelId: "a1", chargeId, lagerortId, menge,
    quelleTyp: "system" as const, quelleId: "t", referenz: null, kommentar: null,
  });
  t.db.insert(buchungen).values([
    b("c-alt", HANDLAGER_ID, 20),
    b("c-alt", "rtw-1", 4),
  ]).run();
});
afterEach(() => t.schliessen());

const rohZeilen = () => t.db.select().from(buchungen).all()
  .map((x) => ({ lagerortId: x.lagerortId, menge: x.menge, artikelId: x.artikelId }));

function inTx<T>(fn: (tx: Parameters<Parameters<typeof t.db.transaction>[0]>[0]) => T): T {
  return t.db.transaction((tx) => fn(tx));
}

describe("korrekturAufLagerort — I4", () => {
  it("nach dem Abgleich gilt bestandProLagerort === istMenge (Abwaerts)", () => {
    const r = inTx((tx) => korrekturAufLagerort(tx, {
      artikelId: "a1", lagerortId: "rtw-1", istMenge: 1,
      quelle: QUELLE, kommentar: null, referenz: "check:abc" }));
    expect(r.diff).toBe(-3);
    expect(bestandProLagerort(rohZeilen().filter((x) => x.artikelId === "a1"), "rtw-1")).toBe(1);
  });

  it("nach dem Abgleich gilt bestandProLagerort === istMenge (Aufwaerts)", () => {
    const r = inTx((tx) => korrekturAufLagerort(tx, {
      artikelId: "a1", lagerortId: "rtw-1", istMenge: 9,
      quelle: QUELLE, kommentar: null, referenz: "check:abc" }));
    expect(r.diff).toBe(5);
    expect(bestandProLagerort(rohZeilen().filter((x) => x.artikelId === "a1"), "rtw-1")).toBe(9);
  });

  it("diff === 0 schreibt NICHTS", () => {
    const vorher = t.db.select().from(buchungen).all().length;
    const r = inTx((tx) => korrekturAufLagerort(tx, {
      artikelId: "a1", lagerortId: "rtw-1", istMenge: 4,
      quelle: QUELLE, kommentar: null, referenz: "check:abc" }));
    expect(r).toEqual({ diff: 0, chargeId: null });
    expect(t.db.select().from(buchungen).all()).toHaveLength(vorher);
  });

  it("laesst den HANDLAGER-Bestand unberuehrt", () => {
    // Der Abgleich ist LAGERORT-GESCOPED. Ohne das Scoping saehe er 24 statt 4
    // und buchte eine Korrektur von −23 statt −3.
    inTx((tx) => korrekturAufLagerort(tx, {
      artikelId: "a1", lagerortId: "rtw-1", istMenge: 1,
      quelle: QUELLE, kommentar: null, referenz: "check:abc" }));
    expect(bestandProLagerort(rohZeilen().filter((x) => x.artikelId === "a1"), HANDLAGER_ID))
      .toBe(20);
  });
});

describe("korrekturAufLagerort — diff < 0 laeuft ueber FEFO", () => {
  it("bucht negativ mit typ 'korrektur' und der Referenz", () => {
    inTx((tx) => korrekturAufLagerort(tx, {
      artikelId: "a1", lagerortId: "rtw-1", istMenge: 1,
      quelle: QUELLE, kommentar: "Fahrzeug-Check", referenz: "check:abc" }));
    const neu = t.db.select().from(buchungen).all().filter((b) => b.referenz === "check:abc");
    expect(neu).toHaveLength(1);
    expect(neu[0]).toMatchObject({ typ: "korrektur", menge: -3,
      lagerortId: "rtw-1", chargeId: "c-alt" });
  });
});

describe("korrekturAufLagerort — diff > 0: DIE CHARGE WIRD GERATEN (§5.3.3)", () => {
  it("waehlt die JUENGSTE Charge des Artikels OHNE Lagerortbezug", () => {
    /**
     * ⚠️ EINE VON GENAU ZWEI STELLEN IM MODUL, an denen die Charge geraten wird
     * (die zweite ist `inventurKorrektur`, Teil 5). `c-neu` (2028-01) liegt
     * NIRGENDWO im Fahrzeug — und wird trotzdem gewaehlt. DAS IST KEIN DEFEKT,
     * DEN MAN BEIM PORT BEHEBT, sondern ein bewusster Kompromiss MIT einer
     * Kompensation: weil die Charge geraten ist, beantwortet `lagerort_verfall`
     * die Frage „wann laeuft das Zeug im Fahrzeug ab?" (§4.11).
     *
     * Wer das Verfall-Feld im Zaehlschritt als redundant streicht, zerstoert die
     * Kompensation LAUTLOS — und kein Gate wird rot (Falle 9).
     */
    const r = inTx((tx) => korrekturAufLagerort(tx, {
      artikelId: "a1", lagerortId: "rtw-1", istMenge: 9,
      quelle: QUELLE, kommentar: null, referenz: "check:abc" }));
    expect(r.chargeId).toBe("c-neu");
    const neu = t.db.select().from(buchungen).all().filter((b) => b.referenz === "check:abc");
    expect(neu[0]).toMatchObject({ typ: "korrektur", menge: 5, chargeId: "c-neu" });
  });

  it("entscheidet bei gleichem Verfall ueber die JUENGERE createdAt", () => {
    /**
     * ⚠️ DIE ID DER GEWINNERIN IST BEWUSST DIE KLEINSTE. Mit einem Namen wie
     * „c-neuer" liefe die dritte Stufe (`id` ↓) gleichlaeufig mit, und Stufe 2
     * waere nicht isoliert: die Sollreihenfolge kaeme auch ohne sie heraus.
     * `c-a-jung` verliert gegen „c-alt" UND „c-neu" auf der id-Stufe und gewinnt
     * nur ueber die juengere `createdAt`.
     */
    t.db.insert(chargen).values(
      { id: "c-a-jung", artikelId: "a1", chargenNr: "JUNG", verfall: "2028-01",
        createdAt: new Date("2025-06-01T00:00:00Z") }).run();
    const r = inTx((tx) => korrekturAufLagerort(tx, {
      artikelId: "a1", lagerortId: "rtw-1", istMenge: 5,
      quelle: QUELLE, kommentar: null, referenz: "check:xyz" }));
    expect(r.chargeId).toBe("c-a-jung");
  });

  it("legt eine PSEUDO-CHARGE an, wenn der Artikel gar keine hat", () => {
    const r = inTx((tx) => korrekturAufLagerort(tx, {
      artikelId: "a-ohne", lagerortId: "rtw-1", istMenge: 3,
      quelle: QUELLE, kommentar: null, referenz: "check:abc" }));
    const c = t.db.select().from(chargen).all().find((x) => x.id === r.chargeId)!;
    expect(c.chargenNr).toBe(CHARGE_KORREKTUR);
    expect(c.verfall).toBe(PSEUDO_VERFALL);
    // ⚠️ Die BEDEUTUNG haengt am Verfallswert, NIE am Namen (§5.3.2). Die Nummer
    // bleibt als Herkunftshinweis — das einzige Fundstueck, das spaeter noch sagt,
    // woher die Zeile kam.
    expect(istOhneVerfall(c.verfall)).toBe(true);
  });

  it("legt bei einem ZWEITEN Lauf KEINE zweite Pseudo-Charge an", () => {
    inTx((tx) => korrekturAufLagerort(tx, {
      artikelId: "a-ohne", lagerortId: "rtw-1", istMenge: 3,
      quelle: QUELLE, kommentar: null, referenz: "check:1" }));
    inTx((tx) => korrekturAufLagerort(tx, {
      artikelId: "a-ohne", lagerortId: "rtw-1", istMenge: 8,
      quelle: QUELLE, kommentar: null, referenz: "check:2" }));
    expect(t.db.select().from(chargen).all().filter((c) => c.artikelId === "a-ohne"))
      .toHaveLength(1);
  });

  it("entscheidet bei GLEICHEM Verfall UND GLEICHER createdAt deterministisch ueber die chargeId", () => {
    // ⚠️ EIGENE ERGAENZUNG ZUM BRIEF (nicht Teil der wörtlichen Vorgabe): §5.14.4
    // verlangt einen Tiebreaker fuer den Fall, dass zwei Chargen selbst nach
    // verfall UND createdAt (Sekundenaufloesung!) gleichauf liegen. Ohne einen
    // dritten Sortierschluessel entscheidet dann die Ruecklieferreihenfolge der
    // DB (kein ORDER BY auf `chargen`), und Array.prototype.sort ist stabil
    // (ES2019+) — der "Gewinner" waere schlicht die zufaellige Einfuegereihenfolge.
    //
    // Bewusst LOSER-FIRST eingefuegt: "c-tie-1" kommt vor "c-tie-2" aus der DB.
    // Ohne dritten Schluessel bliebe c-tie-1 an Position 0 (stabiler Sort bei
    // Gleichstand) und der Test schluege fehl, wenn wir "c-tie-2" erwarten.
    const GLEICH = new Date("2026-04-01T00:00:00Z");
    t.db.insert(chargen).values([
      { id: "c-tie-1", artikelId: "a-tie", chargenNr: "TIE1", verfall: "2027-05",
        createdAt: GLEICH },
      { id: "c-tie-2", artikelId: "a-tie", chargenNr: "TIE2", verfall: "2027-05",
        createdAt: GLEICH },
    ]).run();
    const r = inTx((tx) => korrekturAufLagerort(tx, {
      artikelId: "a-tie", lagerortId: "rtw-1", istMenge: 2,
      quelle: QUELLE, kommentar: null, referenz: "check:tie" }));
    expect(r.chargeId).toBe("c-tie-2");
  });
});
