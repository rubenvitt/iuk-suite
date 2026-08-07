import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { migrierteTestDb, type TestDb } from "../../_db/testdb";
import { artikel, buchungen, chargen, lagerorte, newId } from "../../_db/schema";
import { bestellvorschlag } from "./bestellung";
import { HANDLAGER_ID } from "../konstanten";

const NOW = new Date("2026-06-15T10:00:00Z");
const BESTELLT_AM = new Date("2026-06-01T08:00:00Z");
let t: TestDb;

beforeEach(() => {
  t = migrierteTestDb("lagerbuch-lp-bestellung-");
  // "handlager" existiert bereits nach der Migration (0003_handlager.sql,
  // ensureHandlager). Ein FAHRZEUG-Lagerort kommt dazu, weil der Test sonst nicht
  // beweisen kann, dass `bestellvorschlag` wirklich NUR den Handlager-Bestand
  // rechnet — in einer frisch migrierten DB waeren Handlager- und
  // Fahrzeugbestand sonst identisch (0), und ein fehlendes `lagerort_id`-
  // Praedikat bliebe unsichtbar.
  t.db.insert(lagerorte).values([
    { id: "rtw-1", name: "RTW 1", typ: "fahrzeug", kennung: "MS-1", aktiv: true },
  ]).run();

  t.db.insert(artikel).values([
    // Kein Bestand ueberhaupt (keine Buchungszeile) → Bestand muss ueber `?? 0`
    // aus einer LEEREN Gruppe kommen, nicht aus einer Zeile mit 0.
    { id: "a-leer", name: "Leer", einheit: "Stk.", fach: "A1",
      mindestbestand: 10, aktiv: true, createdAt: NOW },
    { id: "a-bestellt", name: "Bestellt", einheit: "Stk.", fach: "A2",
      mindestbestand: 10, aktiv: true, createdAt: NOW, bestelltAt: BESTELLT_AM },
    { id: "a-voll", name: "Voll", einheit: "Stk.", fach: "A3",
      mindestbestand: 1, aktiv: true, createdAt: NOW },
    // Als bestellt markiert und inzwischen wieder gedeckt. Diese Zeile muss
    // weiterhin sichtbar sein, damit die veraltete Markierung zurueckgenommen
    // werden kann; sie ist aber KEIN neuer Bestellvorschlag mehr.
    { id: "a-da", name: "A Ware da", einheit: "Stk.", fach: "A3b",
      mindestbestand: 2, aktiv: true, createdAt: NOW, bestelltAt: BESTELLT_AM },
    { id: "a-inaktiv", name: "Inaktiv", einheit: "Stk.", fach: "A4",
      mindestbestand: 99, aktiv: false, createdAt: NOW },
    // Bestand NUR im Fahrzeug, NICHTS im Handlager (§5.2.1: der Vorschlag rechnet
    // Handlager). Ohne `lagerort_id` im Praedikat zaehlte der Fahrzeugbestand als
    // Handlager-Rest mit, und dieser Artikel verschwaende zu Unrecht aus der Liste.
    { id: "a-nur-fzg", name: "Nur Fahrzeug", einheit: "Stk.", fach: "A5",
      mindestbestand: 5, aktiv: true, createdAt: NOW },
    // Bestand an BEIDEN Lagerorten, mit UNTERSCHIEDLICHEN Zahlen — die schaerfere
    // Form der Auflage "deine Testdaten muessen sich an den Lagerorten
    // tatsaechlich unterscheiden": dieser Artikel bleibt in der Liste, ob das
    // `lagerort_id`-Praedikat greift oder nicht (3 < 10 und 7 < 10 sind beide
    // wahr) — nur die exakten `bestand`/`vorschlag`-Werte verraten, ob wirklich
    // nur der Handlager-Anteil (3) gezaehlt wurde oder beide zusammen (7).
    { id: "a-gemischt", name: "Gemischt", einheit: "Stk.", fach: "A6",
      mindestbestand: 10, aktiv: true, createdAt: NOW },
    // GRENZFALL: Bestand EXAKT gleich Mindestbestand. `braucht` ist STRIKT
    // kleiner (T31) — bei Gleichstand ist der Artikel NICHT in der Liste. Ohne
    // diese Zeile befaehrt kein Test die Kante zwischen "<" und "<="; eine
    // versehentliche Umstellung auf "<=" in vorschlag.ts bliebe hier unsichtbar.
    { id: "a-grenze", name: "Grenze", einheit: "Stk.", fach: "A7",
      mindestbestand: 6, aktiv: true, createdAt: NOW },
  ]).run();

  t.db.insert(chargen).values([
    { id: "c-voll", artikelId: "a-voll", chargenNr: "CH", verfall: "2030-01", createdAt: NOW },
    { id: "c-da", artikelId: "a-da", chargenNr: "CH-DA", verfall: "2030-01", createdAt: NOW },
    { id: "c-fzg", artikelId: "a-nur-fzg", chargenNr: "CH2", verfall: "2030-01", createdAt: NOW },
    { id: "c-gemischt", artikelId: "a-gemischt", chargenNr: "CH3", verfall: "2030-01", createdAt: NOW },
    { id: "c-grenze", artikelId: "a-grenze", chargenNr: "CH4", verfall: "2030-01", createdAt: NOW },
  ]).run();

  t.db.insert(buchungen).values([
    { id: newId(), ts: NOW, typ: "zugang", artikelId: "a-voll", chargeId: "c-voll",
      lagerortId: HANDLAGER_ID, menge: 5, quelleTyp: "system", quelleId: "t",
      referenz: null, kommentar: null },
    { id: newId(), ts: NOW, typ: "korrektur", artikelId: "a-da", chargeId: "c-da",
      lagerortId: HANDLAGER_ID, menge: 2, quelleTyp: "system", quelleId: "t",
      referenz: null, kommentar: "Inventur" },
    { id: newId(), ts: NOW, typ: "zugang", artikelId: "a-nur-fzg", chargeId: "c-fzg",
      lagerortId: "rtw-1", menge: 20, quelleTyp: "system", quelleId: "t",
      referenz: null, kommentar: null },
    { id: newId(), ts: NOW, typ: "zugang", artikelId: "a-gemischt", chargeId: "c-gemischt",
      lagerortId: HANDLAGER_ID, menge: 3, quelleTyp: "system", quelleId: "t",
      referenz: null, kommentar: null },
    { id: newId(), ts: NOW, typ: "zugang", artikelId: "a-gemischt", chargeId: "c-gemischt",
      lagerortId: "rtw-1", menge: 4, quelleTyp: "system", quelleId: "t",
      referenz: null, kommentar: null },
    { id: newId(), ts: NOW, typ: "zugang", artikelId: "a-grenze", chargeId: "c-grenze",
      lagerortId: HANDLAGER_ID, menge: 6, quelleTyp: "system", quelleId: "t",
      referenz: null, kommentar: null },
  ]).run();
});
afterEach(() => t.schliessen());

describe("bestellvorschlag", () => {
  it("zeigt eine markierte, wieder gedeckte Position mit Vorschlag 0 zur Ruecknahme weiter an", () => {
    const z = bestellvorschlag(t.db).find((x) => x.id === "a-da");
    expect(z).toMatchObject({
      bestellt: true,
      bestand: 2,
      mindestbestand: 2,
      vorschlag: 0,
      wareOffenbarDa: true,
    });
  });

  it("enthaelt genau aktive Unterbestaende plus markierte, wieder gedeckte Positionen", () => {
    expect(bestellvorschlag(t.db).map((z) => z.id).sort()).toEqual(
      ["a-bestellt", "a-da", "a-gemischt", "a-leer", "a-nur-fzg"],
    );
  });

  it("ordnet Unterbestaende vor gedeckten Markierungen, darin deutsch nach Name und dann ID", () => {
    // "A Ware da" wuerde bei einer rein alphabetischen Gesamtsortierung ganz
    // vorne stehen. Die fachliche Dringlichkeit muss staerker sein als der Name.
    t.db.update(artikel).set({ name: "Gleich" }).where(eq(artikel.id, "a-bestellt")).run();
    t.db.update(artikel).set({ name: "Gleich" }).where(eq(artikel.id, "a-gemischt")).run();
    expect(bestellvorschlag(t.db).map((z) => z.id)).toEqual([
      "a-bestellt", "a-gemischt", "a-leer", "a-nur-fzg", "a-da",
    ]);
  });

  it("laesst einen Artikel ohne jede Buchung nicht an `?? 0` scheitern", () => {
    // `sum(...)` liefert bei leerer Gruppe KEINE Zeile — die Map hat fuer
    // "a-leer" ueberhaupt keinen Schluessel.
    expect(bestellvorschlag(t.db).find((z) => z.id === "a-leer")!.bestand).toBe(0);
  });

  it("rechnet gegen den HANDLAGER-Bestand, NICHT den lagerortuebergreifenden (§5.2.1)", () => {
    // a-nur-fzg hat 20 Stueck im Fahrzeug und 0 im Handlager. Zaehlte der
    // Fahrzeugbestand mit, waere `bestand` 20 (>= mindestbestand 5) und der
    // Artikel verschwaende ganz aus der Liste — der Test oben faengt DAS bereits;
    // hier wird zusaetzlich die Handlager-Zahl selbst behauptet.
    expect(bestellvorschlag(t.db).find((z) => z.id === "a-nur-fzg")!.bestand).toBe(0);
  });

  it("summiert NICHT ueber Lagerorte hinweg, wenn der Artikel an BEIDEN Bestand hat", () => {
    // a-gemischt bleibt in der Liste, egal ob das lagerort_id-Praedikat greift
    // (3 < 10 UND 3+4=7 < 10 sind beide wahr) — nur die exakte Zahl verraet den
    // Unterschied: 3 (nur Handlager, richtig) vs. 7 (Handlager + Fahrzeug, Bug).
    const z = bestellvorschlag(t.db).find((x) => x.id === "a-gemischt")!;
    expect(z.bestand).toBe(3);
    expect(z.vorschlag).toBe(7);
  });

  it("laesst Artikel mit ausreichendem Handlager-Bestand weg (a-voll)", () => {
    expect(bestellvorschlag(t.db).some((z) => z.id === "a-voll")).toBe(false);
  });

  it("laesst INAKTIVE Artikel weg, auch weit unter Mindestbestand", () => {
    expect(bestellvorschlag(t.db).some((z) => z.id === "a-inaktiv")).toBe(false);
  });

  it("laesst einen Artikel GENAU AUF Mindestbestand weg — `braucht` ist STRIKT kleiner (T31)", () => {
    // a-grenze: bestand 6 === mindestbestand 6. Bei Gleichstand ist der Artikel
    // NICHT in der Liste (T31, `braucht`). Kippte die Grenze versehentlich auf
    // "<=", erschiene a-grenze hier — und `vorschlagsmenge` liefe (per
    // `Math.max(0, mindestbestand - bestand)`) trotzdem korrekt 0, wodurch der
    // naechste Test ("Vorschlag >= 1 fuer jede Zeile") den Fehler ebenfalls faengt.
    expect(bestellvorschlag(t.db).some((z) => z.id === "a-grenze")).toBe(false);
  });

  it("rechnet die Vorschlagsmenge exakt als mindestbestand - bestand (KEIN Faktor)", () => {
    const z = bestellvorschlag(t.db);
    expect(z.find((x) => x.id === "a-leer")!.vorschlag).toBe(10);
    expect(z.find((x) => x.id === "a-bestellt")!.vorschlag).toBe(10);
    expect(z.find((x) => x.id === "a-nur-fzg")!.vorschlag).toBe(5);
  });

  it("liefert fuer jeden Unterbestand mindestens 1, fuer gedeckte Markierungen genau 0", () => {
    // Universelle Zusicherung ueber beide fachlichen Mengen: gedeckte
    // Markierungen bleiben nur zum Zuruecknehmen sichtbar und duerfen keinen
    // neuen Bestellbedarf vortaeuschen.
    for (const z of bestellvorschlag(t.db)) {
      if (z.wareOffenbarDa) expect(z.vorschlag).toBe(0);
      else expect(z.vorschlag).toBeGreaterThanOrEqual(1);
    }
  });

  it("liefert `bestelltSeit` — die einzige wahre Aussage der Spalte (§5.5)", () => {
    /**
     * Der heutige Leser wirft sie weg (`bestellt: Boolean(a.bestelltAt)`,
     * `queries.ts:520`). Die Liste zeigt ab jetzt „bestellt seit <Datum>" statt
     * eines Hakens — dieselbe Spalte, eine Aussage mehr, null Migrationskosten.
     */
    const z = bestellvorschlag(t.db).find((x) => x.id === "a-bestellt")!;
    expect(z.bestellt).toBe(true);
    expect(z.bestelltSeit?.getTime()).toBe(BESTELLT_AM.getTime());
  });

  it("behaelt `bestellt: boolean` und liefert die vollstaendige Zeilenform (CSV bleibt 1:1)", () => {
    // §9.2, 1:1-Pflicht 28: dort bleibt `Status` = bestellt/offen. `toStrictEqual`
    // statt `toEqual`, damit ein zusaetzliches oder ein FEHLENDES Feld auffiele
    // (Vitest behandelt bei `toEqual` einen fehlenden Schluessel wie `undefined` —
    // T43-Lehre).
    const z = bestellvorschlag(t.db).find((x) => x.id === "a-leer")!;
    expect(z).toStrictEqual({
      id: "a-leer", name: "Leer", einheit: "Stk.", fach: "A1",
      bestand: 0, mindestbestand: 10, vorschlag: 10,
      bestellt: false, bestelltSeit: null, wareOffenbarDa: false,
    });
  });

  it("setzt `wareOffenbarDa` nur fuer markierte Positionen ohne Unterbestand", () => {
    const z = bestellvorschlag(t.db);
    expect(z.filter((x) => x.wareOffenbarDa).map((x) => x.id)).toEqual(["a-da"]);
    expect(z.find((x) => x.id === "a-bestellt")?.wareOffenbarDa).toBe(false);
  });

  /**
   * H11: `bestellvorschlag` nimmt `Leser`, nicht `DB`, weil sie ausschliesslich
   * `select()` braucht und deshalb auch INNERHALB einer Transaktion laufen
   * koennen muss. Ohne diesen Test prueft nur der Typparameter das — kein
   * Testlauf. Ein `db: DB` in der Signatur liesse alle anderen Tests hier gruen,
   * weil sie ausnahmslos mit `t.db` (der offenen Verbindung) aufrufen; erst der
   * Aufruf `t.db.transaction((tx) => bestellvorschlag(tx))` zwingt den
   * Compiler, die `Leser`-Vertraeglichkeit tatsaechlich zu pruefen.
   */
  it("laeuft INNERHALB einer Transaktion (H11)", () => {
    const z = t.db.transaction((tx) => bestellvorschlag(tx));
    expect(z.map((x) => x.id).sort()).toEqual([
      "a-bestellt", "a-da", "a-gemischt", "a-leer", "a-nur-fzg",
    ]);
  });
});
