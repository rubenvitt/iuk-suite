import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import { artikel, buchungen, chargen, lagerorte } from "../_db/schema";
import { HANDLAGER_ID } from "../_lib/konstanten";
import { RIEGEL_TEXTE, darfErneuern, leerText } from "../_lib/actionTypen";

/**
 * DIE DREI BUCHUNGSWEGE — Teil 5, T114 (vorgezogen vor Welle 7 von Teil 4).
 *
 * Was diese Datei traegt, und warum jeweils GENAU HIER:
 *
 *   - I5: der Zugang lehnt eine artikelFREMDE Charge ab. Traeger ist der
 *     Fall „Charge gehoert zu Artikel B, gebucht wird auf A" — ohne die
 *     Pruefung entstuende Bestand, den FEFO nie wiederfindet.
 *   - `bestelltAt` wird beim Zugang genullt. Der Test setzt die Markierung
 *     VORHER und weist sie nach — sonst waere `toBeNull()` auch dann gruen,
 *     wenn nie eine Markierung dagewesen waere.
 *   - Ein Ziel-FAHRZEUG macht aus der Entnahme eine UMLAGERUNG mit Netto null.
 *     Zugesichert wird nicht nur die Summe (die ist auf einer leeren
 *     Trefferliste ebenfalls 0), sondern dass BEIDE Legs da sind.
 *   - Das Handlager als Ziel ist VERBRAUCH. Zugesichert wird nicht nur die
 *     Abwesenheit der Umlagerung (die faellt auch dann weg, wenn gar nichts
 *     gebucht wird), sondern dass die Entnahme-Zeile entsteht.
 *   - Der Rueckgabewert von `requireHelferSchreibend` wird AUSGEWERTET: die
 *     beiden Riegelfaelle antworten mit ihrem GRUND und schreiben nichts.
 *   - `gebucht === 0` ist ein FEHLER mit dem ARTIKELNAMEN im Satz, kein
 *     gruener Haken auf leerem Handlager.
 *   - Der Helfer-Weg fragt den ADMIN-Riegel nicht. Das ist hier ein
 *     VERHALTENStest (der Admin-Riegel wirft), kein Quelltext-Scan: ein Scan
 *     auf die Schreibweise fixierte nur einen Namen und liefe bei jeder
 *     Umbenennung ins Leere.
 *
 * ⚠️ KEIN Quelltext-Scan in dieser Datei → auch keine lokale Kopie von
 * `ohneKommentare()` (N-5). Jede Zusage haengt am Verhalten.
 *
 * ⚠️ N-1 (Sitzungs-Secret) greift hier NICHT: `_lib/helferZugang` ist
 * vollstaendig gemockt, `createHelferSitzung` wird auf keinem Pfad erreicht.
 */

/**
 * Die Vorrichtung liegt in `vi.hoisted`, wie im Bestand
 * (`_actions/check.test.ts:78-81`, `_actions/gate.test.ts:71`): `vi.mock` wird
 * an den Dateikopf gehoben, ein Modulebenen-`const` waere zu diesem Zeitpunkt
 * noch in der temporalen Totzone — der Import von `./buchung` liefe dann in
 * einen `ReferenceError` statt in den Test.
 */
const { revalidiert, riegel, adminRiegel } = vi.hoisted(() => ({
  revalidiert: [] as string[],
  riegel: vi.fn<(db: unknown) => Promise<unknown>>(),
  adminRiegel: vi.fn<() => Promise<unknown>>(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (p: string) => { revalidiert.push(p); },
}));

/*
 * Das ZIELCOOKIE — die Buchung am Regal liest es, weil das Ziel aus der Insel
 * eine Behauptung des Clients ist und das Cookie die Erinnerung des Servers.
 */
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "helfer_ziel" && zielCookie !== undefined ? { name, value: zielCookie } : undefined) }),
}));

vi.mock("../_lib/helferZugang", () => ({
  requireHelferSchreibend: (db: unknown) => riegel(db),
}));

vi.mock("../_lib/zugang", () => ({
  requireLagerbuchAdmin: () => adminRiegel(),
}));

/**
 * `getDb()` darf in diesem Lauf NIE fallen: jeder Aufruf uebergibt `t.db`
 * ausdruecklich. Ein Wurf statt eines Stubs macht einen vergessenen
 * db-Parameter laut statt still — sonst oeffnete der Test die ECHTE Moduldatei
 * unter `.data/` und schriebe hinein (`_actions/check.test.ts:96-99`).
 */
vi.mock("../_db/client", () => ({
  getDb: () => { throw new Error("getDb() im Test — jeder Aufruf uebergibt t.db"); },
}));

import { bucheZugang, bucheEntnahme, bucheEntnahmeHelfer, bucheUmlagerung } from "./buchung";

let t: TestDb;

const VIEWER = { sub: "u-admin", groups: ["lagerbuch"], name: "A. Verwaltung", email: null };

const ZUGANG_OK = {
  ok: true,
  zugang: {
    tokenId: "tk1",
    code: "482-137",
    label: "RTW 1",
    laeuftAb: new Date(Date.now() + 3_600_000),
  },
};

/**
 * DRK-300 — die AUSDRÜCKLICHE Verbrauchswahl. Sie steht in jedem Aufruf, der
 * ohne Fahrzeug bucht, und das ist keine Umständlichkeit: seit DRK-300 ist ein
 * FEHLENDES Ziel kein Verbrauch mehr, sondern „noch nichts gewählt" — und das
 * bucht nicht.
 */
const VERBRAUCH = { art: "verbrauch" } as const;

/**
 * Der rohe Cookie-Wert der Anfrage. Er trägt die Kärtchen-Kennung `tk1` —
 * dieselbe, die `ZUGANG_OK` führt.
 */
let zielCookie: string | undefined;

const JETZT = new Date("2026-06-15T10:00:00Z");

beforeEach(() => {
  revalidiert.length = 0;
  zielCookie = "tk1|verbrauch";
  riegel.mockResolvedValue(ZUGANG_OK);
  adminRiegel.mockResolvedValue(VIEWER);
  t = migrierteTestDb("lagerbuch-actions-buchung-");
  // ⚠️ `handlager` wird NICHT eingefuegt: Migration `0003_handlager.sql:16`
  // legt die Zeile an, ein zweiter Insert scheitert mit
  // `UNIQUE constraint failed`. Und `lagerorte` traegt KEIN `createdAt`
  // (`_db/schema.ts:32-43`) — der Plan druckt es ab (Regel 1, Befund 4).
  t.db.insert(lagerorte).values([
    { id: "fz-1", name: "RTW 1", typ: "fahrzeug", aktiv: true },
    { id: "fz-alt", name: "RTW alt", typ: "fahrzeug", aktiv: false },
    { id: "lager-2", name: "Aussenlager", typ: "lager", aktiv: true },
  ]).run();
  expect(t.db.select().from(lagerorte).all().some((l) => l.id === HANDLAGER_ID)).toBe(true);
  t.db.insert(artikel).values([
    { id: "art-1", name: "Mullbinde", einheit: "Stk", fach: "A-01",
      mindestbestand: 5, aktiv: true, createdAt: JETZT },
    // Der Artikel OHNE Bestand — er traegt den `leer`-Zweig und mit seinem
    // Namen die Zusage „der Satz nennt den Artikel".
    { id: "art-2", name: "Wärmedecke", einheit: "Stk", fach: "A-02",
      mindestbestand: 0, aktiv: true, createdAt: JETZT },
  ]).run();
  t.db.insert(chargen).values([
    { id: "ch-1", artikelId: "art-1", chargenNr: "L1", verfall: "2027-03", createdAt: JETZT },
  ]).run();
  // 10 Stueck Mullbinde im Handlager — direkt gesetzt, nicht ueber eine Action:
  // sonst haengt jeder Entnahme-Test am Zugang.
  t.db.insert(buchungen).values([
    { id: "b-seed", ts: JETZT, typ: "zugang", artikelId: "art-1", chargeId: "ch-1",
      lagerortId: HANDLAGER_ID, menge: 10, quelleTyp: "system", quelleId: "seed",
      referenz: null, kommentar: null },
  ]).run();
});

// ⚠️ `t.schliessen()`, NICHT `t.aufraeumen()`: `TestDb` hat genau `db`, `sqlite`
// und `schliessen` (Befund 11).
afterEach(() => { t.schliessen(); vi.clearAllMocks(); });

/** Alle Zeilen, die eine Action geschrieben hat — die Saatzeile bleibt draussen. */
function geschrieben() {
  return t.db.select().from(buchungen).all().filter((b) => b.quelleId !== "seed");
}
function fehlerVon(erg: { ok: boolean }) {
  return (erg as { ok: false; fehler: string }).fehler;
}
function feldFehlerVon(erg: { ok: boolean }) {
  return (erg as { ok: false; feldFehler?: Record<string, string> }).feldFehler;
}
function helferFehler(erg: { ok: boolean }) {
  return erg as { ok: false; grund: string; text: string };
}

describe("bucheZugang", () => {
  it("legt eine neue Charge an und bucht sie auf das Handlager", async () => {
    const erg = await bucheZugang(
      { artikelId: "art-1", menge: 10, neueCharge: { chargenNr: "L42", verfall: "2027-06" } },
      t.db,
    );
    expect(erg.ok).toBe(true);

    const neue = t.db.select().from(chargen).all().filter((c) => c.id !== "ch-1");
    expect(neue).toHaveLength(1);
    expect(neue[0]).toMatchObject({ artikelId: "art-1", chargenNr: "L42", verfall: "2027-06" });

    const b = geschrieben();
    expect(b).toHaveLength(1);
    // `quelleId` ist der `sub` des Viewers — die Verdrahtung Riegel → Journal.
    expect(b[0]).toMatchObject({
      typ: "zugang", menge: 10, artikelId: "art-1", chargeId: neue[0]!.id,
      lagerortId: HANDLAGER_ID, quelleTyp: "oidc", quelleId: "u-admin",
    });
    // INNERE Pfade, in dieser Reihenfolge (§3). Ein aeusserer Pfad trifft
    // nichts und wirft dabei nicht.
    expect(revalidiert).toEqual(["/m/lagerbuch/verwaltung/artikel", "/m/lagerbuch/verwaltung"]);
  });

  it("I5: lehnt eine Charge ab, die zu einem ANDEREN Artikel gehoert", async () => {
    /*
     * Ohne diese Pruefung entstuende „phantom, un-withdrawable Bestand": die
     * Buchung laege auf Artikel A, die Charge auf Artikel B. Der Bestand von A
     * stiege, und FEFO faende die Charge nie. Teil 3 hat die Invariante
     * ausdruecklich an Teil 5 abgegeben.
     */
    t.db.insert(chargen).values({
      id: "ch-fremd", artikelId: "art-2", chargenNr: "X", verfall: "2027-01", createdAt: JETZT,
    }).run();

    const erg = await bucheZugang({ artikelId: "art-1", menge: 1, chargeId: "ch-fremd" }, t.db);

    expect(erg.ok).toBe(false);
    expect(fehlerVon(erg)).toMatch(/gehört nicht zu diesem Artikel/);
    // Die Transaktion laeuft VOLLSTAENDIG zurueck.
    expect(geschrieben()).toEqual([]);
    expect(revalidiert).toEqual([]);
  });

  it("bucht auf eine Charge, die zu DIESEM Artikel gehoert", async () => {
    // Die Gegenprobe zu I5: die Pruefung darf den erlaubten Fall nicht mitfangen.
    const erg = await bucheZugang({ artikelId: "art-1", menge: 4, chargeId: "ch-1" }, t.db);
    expect(erg.ok).toBe(true);
    expect(geschrieben()).toHaveLength(1);
    expect(geschrieben()[0]).toMatchObject({ chargeId: "ch-1", menge: 4, typ: "zugang" });
  });

  it("setzt bestelltAt zurueck — Grundlage von „Ware offenbar eingetroffen“", async () => {
    // ⚠️ BEIDE Artikel werden markiert, nicht nur der gebuchte. Sonst traegt
    // die Zusicherung am Ende nichts: `art-2` waere ohne diese Zeile vor UND
    // nach dem Aufruf `null` (die Spalte ist nullable ohne Default,
    // `_db/schema.ts:78`), und ein `toBeNull()` darauf koennte konstruktiv nie
    // fehlschlagen.
    t.db.update(artikel).set({ bestelltAt: JETZT })
      .where(inArray(artikel.id, ["art-1", "art-2"])).run();
    // Ohne diese Vorbedingung waere `toBeNull()` unten auch dann gruen, wenn
    // nie eine Bestellmarkierung dagewesen waere — je Artikel eine, sonst
    // verschoebe ein fehlgeschlagenes Update auf `art-2` die Luecke nur.
    expect(t.db.select().from(artikel).where(eq(artikel.id, "art-1")).get()?.bestelltAt)
      .not.toBeNull();
    expect(t.db.select().from(artikel).where(eq(artikel.id, "art-2")).get()?.bestelltAt)
      .not.toBeNull();

    await bucheZugang(
      { artikelId: "art-1", menge: 1, neueCharge: { chargenNr: "L1", verfall: "2027-01" } },
      t.db,
    );

    expect(t.db.select().from(artikel).where(eq(artikel.id, "art-1")).get()?.bestelltAt)
      .toBeNull();
    /*
     * Und NUR bei diesem Artikel — DIE Zeile mit der Schadenswirkung.
     * Traeger ist das `.where(eq(artikel.id, v.artikelId))` in `buchung.ts`.
     * Ohne die Eingrenzung verloere JEDER Artikel des Bestands seine
     * Bestellmarkierung, sobald IRGENDWO ein Zugang gebucht wird: stiller
     * Datenverlust ueber die ganze Tabelle, der vorherige Wert ist NICHT
     * rekonstruierbar (`_db/schema.ts:76-77`), und die „Ware offenbar
     * eingetroffen"-Anzeige (§5.5) verloere fuer ALLE Positionen ihre
     * Grundlage. Der unveraenderte Zeitwert, nicht nur „irgendetwas nicht
     * Null": die Markierung soll UEBERLEBEN, nicht ersetzt werden.
     */
    expect(t.db.select().from(artikel).where(eq(artikel.id, "art-2")).get()?.bestelltAt?.getTime())
      .toBe(JETZT.getTime());
  });

  it("verlangt GENAU eine Chargenangabe — mit dem Grund am Feld", async () => {
    // ⚠️ `ok === false` ALLEIN traegt die Regel NICHT: ohne das `refine` liefe
    // der Fall „gar keine Charge" in ein NOT-NULL der Datenbank und waere
    // ebenfalls `ok:false`. Der Traeger ist der FELDFEHLER.
    const ohne = await bucheZugang({ artikelId: "art-1", menge: 1 }, t.db);
    expect(ohne.ok).toBe(false);
    expect(feldFehlerVon(ohne)?.chargeId).toBe("Genau eine Charge angeben");

    const beides = await bucheZugang(
      { artikelId: "art-1", menge: 1, chargeId: "ch-1",
        neueCharge: { chargenNr: "L", verfall: "2027-01" } },
      t.db,
    );
    expect(beides.ok).toBe(false);
    expect(feldFehlerVon(beides)?.chargeId).toBe("Genau eine Charge angeben");

    expect(geschrieben()).toEqual([]);
    expect(revalidiert).toEqual([]);
  });

  it("lehnt einen Verfall ab, der nicht YYYY-MM ist", async () => {
    const erg = await bucheZugang(
      { artikelId: "art-1", menge: 1, neueCharge: { chargenNr: "L", verfall: "06/2027" } },
      t.db,
    );
    expect(erg.ok).toBe(false);
    expect(feldFehlerVon(erg)?.["neueCharge.verfall"]).toMatch(/YYYY-MM/);
    // Ohne die Regex laege jetzt eine Charge mit unlesbarem Verfall in der DB —
    // und mit ihr eine kaputte Ampel und eine kaputte FEFO-Sortierung.
    expect(t.db.select().from(chargen).all()).toHaveLength(1);
  });

  it("lehnt eine Menge von 0 oder weniger ab", async () => {
    for (const menge of [0, -3]) {
      const erg = await bucheZugang(
        { artikelId: "art-1", menge, neueCharge: { chargenNr: "L", verfall: "2027-01" } },
        t.db,
      );
      expect(erg.ok).toBe(false);
      expect(feldFehlerVon(erg)?.menge).toMatch(/größer als 0/);
    }
    expect(geschrieben()).toEqual([]);
  });
});

describe("bucheEntnahme", () => {
  it("bucht ohne Ziel per FEFO aus dem Handlager ab", async () => {
    const erg = await bucheEntnahme({ artikelId: "art-1", menge: 3, kommentar: "Einsatz" }, t.db);

    expect(erg.ok).toBe(true);
    expect((erg as { ok: true; wert: { gebucht: number } }).wert.gebucht).toBe(3);
    const b = geschrieben();
    expect(b).toHaveLength(1);
    // VORZEICHENBEHAFTET: ein Abgang ist negativ.
    expect(b[0]).toMatchObject({
      typ: "entnahme", menge: -3, chargeId: "ch-1", lagerortId: HANDLAGER_ID,
      quelleTyp: "oidc", quelleId: "u-admin", kommentar: "Einsatz",
    });
    expect(revalidiert).toEqual(["/m/lagerbuch/verwaltung/artikel", "/m/lagerbuch/verwaltung"]);
  });

  it("mit Ziel-Fahrzeug wird daraus eine Umlagerung — mit BEIDEN Legs, netto null", async () => {
    const erg = await bucheEntnahme({ artikelId: "art-1", menge: 4, zielLagerortId: "fz-1" }, t.db);
    expect(erg.ok).toBe(true);

    const um = geschrieben().filter((b) => b.typ === "umlagerung");
    // ⚠️ Die Summe ALLEIN traegt nichts: auf einer LEEREN Trefferliste ist sie
    // ebenfalls 0. Erst die Laenge macht daraus eine Zusage.
    expect(um).toHaveLength(2);
    expect(um.reduce((s, b) => s + b.menge, 0)).toBe(0);
    expect(um.find((b) => b.lagerortId === HANDLAGER_ID)).toMatchObject({ menge: -4 });
    // Der Verbrauch bleibt am Fahrzeug und sinkt erst beim naechsten Check.
    expect(um.find((b) => b.lagerortId === "fz-1")).toMatchObject({ menge: 4, chargeId: "ch-1" });
    // Die einzige Klammer zwischen den beiden Legs (§5.14.4).
    expect(um.every((b) => b.referenz === "entnahme-ziel:fz-1")).toBe(true);
    // KEIN Verbrauch: sonst zaehlte das Reporting eine interne Verschiebung
    // als Entnahme.
    expect(geschrieben().some((b) => b.typ === "entnahme")).toBe(false);
  });

  it("lehnt ein INAKTIVES Fahrzeug als Ziel ab", async () => {
    const erg = await bucheEntnahme({ artikelId: "art-1", menge: 1, zielLagerortId: "fz-alt" }, t.db);
    expect(erg.ok).toBe(false);
    expect(fehlerVon(erg)).toMatch(/Fahrzeug/);
    expect(geschrieben()).toEqual([]);
    expect(revalidiert).toEqual([]);
  });

  it("lehnt ein UNBEKANNTES Ziel ab — mit dem fachlichen Satz, nicht mit dem der Datenbank", async () => {
    // ⚠️ `ok === false` allein traegt hier nichts: ohne die Pruefung schlaegt
    // der Fremdschluessel zu und die Action antwortet ebenfalls mit `false` —
    // dann aber mit „FOREIGN KEY constraint failed".
    const erg = await bucheEntnahme(
      { artikelId: "art-1", menge: 1, zielLagerortId: "gibtsnicht" }, t.db);
    expect(erg.ok).toBe(false);
    expect(fehlerVon(erg)).toMatch(/Fahrzeug/);
    expect(geschrieben()).toEqual([]);
  });

  it("lehnt einen LAGERORT ab, der kein Fahrzeug ist", async () => {
    const erg = await bucheEntnahme(
      { artikelId: "art-1", menge: 1, zielLagerortId: "lager-2" }, t.db);
    expect(erg.ok).toBe(false);
    expect(fehlerVon(erg)).toMatch(/Fahrzeug/);
    expect(geschrieben()).toEqual([]);
  });

  it("das Handlager als Ziel ist KEINE Umlagerung, sondern Verbrauch", async () => {
    const erg = await bucheEntnahme(
      { artikelId: "art-1", menge: 2, zielLagerortId: HANDLAGER_ID }, t.db);

    // ⚠️ „keine Umlagerungszeile" allein traegt nichts — die faellt auch dann
    // weg, wenn die Action das Handlager als Fahrzeug ABWEIST und gar nichts
    // bucht. Der Traeger ist die ENTNAHME-Zeile.
    expect(erg.ok).toBe(true);
    expect((erg as { ok: true; wert: { gebucht: number } }).wert.gebucht).toBe(2);
    expect(geschrieben()).toHaveLength(1);
    expect(geschrieben()[0]).toMatchObject({ typ: "entnahme", menge: -2, lagerortId: HANDLAGER_ID });
    expect(geschrieben().some((b) => b.typ === "umlagerung")).toBe(false);
  });
});

/**
 * DRK-297 — der Zugang bekommt einen Zielort. `ARTIKEL_A`/`CHARGE_A`/`RTW1`
 * aus dem Aufgabenbrief heissen in dieser Datei `art-1`/`ch-1`/`fz-1` (die
 * bestehenden Fixture-Namen aus dem `beforeEach` oben, `fz-1` ist dort schon
 * ein AKTIVES Fahrzeug) — inhaltsgleich, an die vorhandene Vorrichtung
 * angepasst statt eine zweite parallele anzulegen.
 */
describe("bucheZugang mit Zielort (DRK-297)", () => {
  beforeEach(() => {
    t.db.insert(lagerorte).values([
      { id: "schrank-1", name: "Schrank 1", typ: "lager", parentId: HANDLAGER_ID, aktiv: true },
      { id: "schrank-alt", name: "Schrank alt", typ: "lager", parentId: HANDLAGER_ID, aktiv: false },
    ]).run();
  });

  it("bucht in den gewaehlten Schrank", async () => {
    const erg = await bucheZugang(
      { artikelId: "art-1", menge: 5, chargeId: "ch-1", zielLagerortId: "schrank-1" },
      t.db,
    );
    expect(erg.ok).toBe(true);
    expect(geschrieben()).toHaveLength(1);
    expect(geschrieben()[0]).toMatchObject({ typ: "zugang", lagerortId: "schrank-1" });
  });

  it("ohne Zielort landet der Zugang auf der Wurzel", async () => {
    const erg = await bucheZugang({ artikelId: "art-1", menge: 5, chargeId: "ch-1" }, t.db);
    expect(erg.ok).toBe(true);
    expect(geschrieben()[0]).toMatchObject({ typ: "zugang", lagerortId: HANDLAGER_ID });
  });

  /** DREI BEDINGUNGEN, EIN SATZ — dieselbe Form wie bei `bucheEntnahme`:
   *  ohne die Pruefung entschiede der Fremdschluessel und meldete
   *  „FOREIGN KEY constraint failed", was der Verwaltenden nichts sagt. */
  it("weist ein Fahrzeug als Zugangsziel ab", async () => {
    const erg = await bucheZugang(
      { artikelId: "art-1", menge: 5, chargeId: "ch-1", zielLagerortId: "fz-1" },
      t.db,
    );
    expect(erg).toMatchObject({ ok: false });
    expect(geschrieben()).toEqual([]);
  });

  it("weist einen stillgelegten Schrank ab", async () => {
    const erg = await bucheZugang(
      { artikelId: "art-1", menge: 5, chargeId: "ch-1", zielLagerortId: "schrank-alt" },
      t.db,
    );
    expect(erg).toMatchObject({ ok: false });
    expect(geschrieben()).toEqual([]);
  });
});

describe("bucheEntnahmeHelfer", () => {
  it("bucht mit quelleTyp token und dem CODE als quelleId", async () => {
    const erg = await bucheEntnahmeHelfer(
      { artikelId: "art-1", menge: 2, ziel: VERBRAUCH }, t.db);

    expect(erg.ok).toBe(true);
    expect((erg as { ok: true; wert: { gebucht: number } }).wert.gebucht).toBe(2);
    const b = geschrieben();
    expect(b).toHaveLength(1);
    // Der CODE, nicht die Token-Kennung: das Journal zeigt ihn als Klarnamen.
    expect(b[0]).toMatchObject({
      typ: "entnahme", menge: -2, lagerortId: HANDLAGER_ID,
      quelleTyp: "token", quelleId: "482-137",
    });
    expect(revalidiert).toEqual([
      "/m/lagerbuch/a/art-1",
      "/m/lagerbuch/helfer",
      "/m/lagerbuch/verwaltung",
    ]);
  });

  it("ein GESPERRTER Code bucht NICHT und meldet den Grund", async () => {
    riegel.mockResolvedValue({ ok: false, grund: "gesperrt" });

    const erg = await bucheEntnahmeHelfer({ artikelId: "art-1", menge: 1 }, t.db);

    expect(erg.ok).toBe(false);
    expect(helferFehler(erg).grund).toBe("gesperrt");
    expect(helferFehler(erg).text).toBe(RIEGEL_TEXTE.gesperrt);
    // Kein Erneuern-Feld: derselbe Code scheitert genauso.
    expect(darfErneuern("gesperrt")).toBe(false);
    expect(geschrieben()).toEqual([]);
    expect(revalidiert).toEqual([]);
  });

  it("eine ABGELAUFENE Sitzung bucht NICHT und meldet den ANDEREN Grund", async () => {
    // Der zweite Riegelfall steht hier eigens: nur er belegt, dass der Grund
    // DURCHgereicht und nicht fest verdrahtet wird — an ihm haengt, ob §7.4.4
    // das Erneuern-Feld ueberhaupt anbietet.
    riegel.mockResolvedValue({ ok: false, grund: "sitzung" });

    const erg = await bucheEntnahmeHelfer({ artikelId: "art-1", menge: 1 }, t.db);

    expect(helferFehler(erg).grund).toBe("sitzung");
    expect(helferFehler(erg).text).toBe(RIEGEL_TEXTE.sitzung);
    expect(darfErneuern("sitzung")).toBe(true);
    expect(geschrieben()).toEqual([]);
  });

  it("leeres Handlager ist ein FEHLER mit dem Artikelnamen — kein gruener Haken auf 0", async () => {
    /*
     * ⚠️ DER TEUERSTE ZUSTAND DER TABELLE AUS §7.3: „ein 200, das luegt."
     * FEFO bucht, was da ist — bei leerem Handlager null Stueck. Der Bestand
     * macht daraus „Entnahme gebucht: 0 × Waermedecke" MIT HAEKCHEN, und die
     * Helferin geht mit leeren Haenden zum Fahrzeug.
     */
    const erg = await bucheEntnahmeHelfer(
      { artikelId: "art-2", menge: 1, ziel: VERBRAUCH }, t.db);

    expect(erg.ok).toBe(false);
    expect(helferFehler(erg).grund).toBe("leer");
    // Der Server hat den Namen; die Insel muesste ihn sonst raten.
    expect(helferFehler(erg).text).toContain("Wärmedecke");
    expect(helferFehler(erg).text).toBe(leerText("Wärmedecke"));
    expect(darfErneuern("leer")).toBe(false);
    expect(geschrieben()).toEqual([]);
    // Nichts hat sich geaendert — also wird auch nichts neu erzeugt.
    expect(revalidiert).toEqual([]);
  });

  it("eine unbrauchbare Nutzlast meldet `eingabe`, NICHT `netz`", async () => {
    // ⚠️ Betreiberentscheidung B4 und Global Constraint 12: `"netz"` entsteht
    // NIE serverseitig — es ist der Grund, den der Client im `catch` selbst
    // setzt. Die Verbindung STEHT hier; sie hat gerade eine unvollstaendige
    // Nutzlast geliefert.
    for (const nutzlast of [{}, { artikelId: "art-1", menge: 0 }, { menge: 2 }]) {
      const erg = await bucheEntnahmeHelfer(nutzlast, t.db);
      expect(erg.ok).toBe(false);
      expect(helferFehler(erg).grund).toBe("eingabe");
      expect(helferFehler(erg).text.length).toBeGreaterThan(0);
    }
    expect(darfErneuern("eingabe")).toBe(false);
    expect(geschrieben()).toEqual([]);
    expect(revalidiert).toEqual([]);
  });

  it("der Riegel steht VOR dem Parsen — auf einer Nutzlast, die kein Schema besteht", async () => {
    // Liefe der Parse zuerst, kaeme `eingabe` statt der Sitzungsauskunft — und
    // die Helferin bekaeme „Eingabe unvollstaendig" statt „Kaertchen gesperrt".
    riegel.mockResolvedValue({ ok: false, grund: "gesperrt" });
    const erg = await bucheEntnahmeHelfer({}, t.db);
    expect(helferFehler(erg).grund).toBe("gesperrt");
  });

  /*
   * DRK-300 — DAS ZIEL AM REGAL. Die vier Tests darunter tragen zusammen die
   * Zusage des Tickets; einzeln trägt keiner sie.
   *
   * ⚠️ DER ERSTE IST DER TEURE. „Kein Ziel" und „ausdrücklich kein Fahrzeug"
   * sind zwei Zustände, nicht einer (Betreiberentscheidung, ClickUp DRK-300).
   * Fiele die Unterscheidung weg, buchte jede vergessene Wahl still Verbrauch —
   * der Bestand im Handlager sänke, das Material läge im Fahrzeug, und kein
   * Gate würde rot. Deshalb steht hier NICHT nur `ok === false`, sondern auch
   * „es wurde nichts geschrieben": ohne die zweite Zeile wäre der Test auch
   * dann grün, wenn die Action bucht und danach meckert.
   */
  it("OHNE Ziel wird NICHT gebucht — ein fehlendes Ziel ist kein Verbrauch", async () => {
    const erg = await bucheEntnahmeHelfer({ artikelId: "art-1", menge: 2 }, t.db);

    expect(erg.ok).toBe(false);
    expect(helferFehler(erg).grund).toBe("eingabe");
    expect(helferFehler(erg).text.length).toBeGreaterThan(0);
    expect(geschrieben()).toEqual([]);
    expect(revalidiert).toEqual([]);
  });

  it("mit ZIEL-FAHRZEUG wird daraus eine Umlagerung — BEIDE Legs, netto null", async () => {
    zielCookie = "tk1|fz:fz-1";
    const erg = await bucheEntnahmeHelfer(
      { artikelId: "art-1", menge: 4, ziel: { art: "fahrzeug", lagerortId: "fz-1" } }, t.db);

    expect(erg.ok).toBe(true);
    expect((erg as { ok: true; wert: { gebucht: number } }).wert.gebucht).toBe(4);

    const um = geschrieben().filter((b) => b.typ === "umlagerung");
    // ⚠️ Die Summe ALLEIN trägt nichts: auf einer LEEREN Trefferliste ist sie
    // ebenfalls 0. Erst die Länge macht daraus eine Zusage.
    expect(um).toHaveLength(2);
    expect(um.reduce((s, b) => s + b.menge, 0)).toBe(0);
    expect(um.find((b) => b.lagerortId === HANDLAGER_ID)).toMatchObject({ menge: -4 });
    // Die Charge wandert MIT — sonst verlöre das Fahrzeug die Verfall-Herkunft.
    expect(um.find((b) => b.lagerortId === "fz-1")).toMatchObject({ menge: 4, chargeId: "ch-1" });
    // Die einzige Klammer zwischen den beiden Legs (§5.14.4).
    expect(um.every((b) => b.referenz === "entnahme-ziel:fz-1")).toBe(true);
    // Der CODE bleibt die Quelle, auch auf dem Umlagerungsweg — sonst wäre die
    // Buchung im Journal namenlos.
    expect(um.every((b) => b.quelleTyp === "token" && b.quelleId === "482-137")).toBe(true);
    // KEIN Verbrauch: sonst zählte das Reporting eine interne Verschiebung als
    // Entnahme, und der Bestellvorschlag bestellte nach.
    expect(geschrieben().some((b) => b.typ === "entnahme")).toBe(false);
  });

  it("kappt am Handlagerbestand und hält die Netto-Null auch dann", async () => {
    zielCookie = "tk1|fz:fz-1";
    // 10 liegen da, 12 werden verlangt. Ein Ziel-Leg aus der VERLANGTEN Menge
    // erzeugte Bestand aus dem Nichts (I3) — und das fiele niemandem auf.
    const erg = await bucheEntnahmeHelfer(
      { artikelId: "art-1", menge: 12, ziel: { art: "fahrzeug", lagerortId: "fz-1" } }, t.db);

    expect(erg.ok).toBe(true);
    expect((erg as { ok: true; wert: { gebucht: number } }).wert.gebucht).toBe(10);
    const um = geschrieben().filter((b) => b.typ === "umlagerung");
    expect(um).toHaveLength(2);
    expect(um.reduce((s, b) => s + b.menge, 0)).toBe(0);
    expect(um.find((b) => b.lagerortId === "fz-1")).toMatchObject({ menge: 10 });
  });

  it("mit AUSDRÜCKLICHEM Verbrauch bucht es aus dem Handlager ab — ohne Referenz", async () => {
    const erg = await bucheEntnahmeHelfer(
      { artikelId: "art-1", menge: 2, ziel: VERBRAUCH }, t.db);

    expect(erg.ok).toBe(true);
    expect(geschrieben()).toHaveLength(1);
    expect(geschrieben()[0]).toMatchObject({
      typ: "entnahme", menge: -2, lagerortId: HANDLAGER_ID, referenz: null,
    });
  });

  it("lehnt ein untaugliches Ziel ab, OHNE zu werfen — und bucht nichts", async () => {
    /*
     * ⚠️ „OHNE zu werfen" ist die eigentliche Zusage. Der Verwaltungsweg darf
     * werfen — sein `catch` macht daraus einen Rückgabewert. `bucheEntnahmeHelfer`
     * hat bewusst KEIN try/catch (Global Constraint 12); ein Wurf schlüge bis zur
     * Fehlerseite durch, und dort steht in Produktion ein englischer Satz mit
     * `digest`. Das Telefon der Helferin zeigte also nicht „Fahrzeug wählen",
     * sondern eine Absturzseite.
     *
     * Das Handlager steht in der Liste, weil es EXISTIERT und AKTIV ist — eine
     * Prüfung, die nur auf „unbekannt" testet, ließe es durch, und die Buchung
     * legte Material vom Handlager ins Handlager.
     */
    for (const lagerortId of ["fz-alt", "lager-2", "gibtsnicht", HANDLAGER_ID]) {
      zielCookie = `tk1|fz:${lagerortId}`;
      const erg = await bucheEntnahmeHelfer(
        { artikelId: "art-1", menge: 1, ziel: { art: "fahrzeug", lagerortId } }, t.db);
      expect(erg.ok).toBe(false);
      expect(helferFehler(erg).grund).toBe("eingabe");
      // Der fachliche Satz, nicht der der Datenbank: ohne die Prüfung schlüge
      // der Fremdschlüssel zu und meldete „FOREIGN KEY constraint failed".
      expect(helferFehler(erg).text).toMatch(/Fahrzeug/);
    }
    expect(geschrieben()).toEqual([]);
    expect(revalidiert).toEqual([]);
  });

  it("leeres Handlager bleibt auch MIT Ziel-Fahrzeug ein Fehler, kein Erfolg auf 0", async () => {
    zielCookie = "tk1|fz:fz-1";
    // Der `leer`-Zweig hing bisher allein am Verbrauchspfad. Läge er dort, wäre
    // eine Umlagerung von null Stück ein grüner Haken — und die Helferin ginge
    // mit leeren Händen und einer Erfolgsmeldung zum Fahrzeug.
    const erg = await bucheEntnahmeHelfer(
      { artikelId: "art-2", menge: 1, ziel: { art: "fahrzeug", lagerortId: "fz-1" } }, t.db);

    expect(erg.ok).toBe(false);
    expect(helferFehler(erg).grund).toBe("leer");
    expect(helferFehler(erg).text).toBe(leerText("Wärmedecke"));
    expect(geschrieben()).toEqual([]);
    expect(revalidiert).toEqual([]);
  });

  /*
   * ⚠️ REVIEW-BEFUND P1 ZU PR #140, ZWEITE RUNDE — das eingereichte Ziel muss
   * ZUR LAUFENDEN SITZUNG GEHÖREN, nicht nur zu einem aktiven Fahrzeug.
   *
   * Die Bindung im Cookie allein reicht NICHT: die Insel schickt ihr Ziel als
   * Nutzlast, und eine offene Artikelseite überlebt einen Kärtchenwechsel in
   * einem zweiten Tab. Ihre Buchung träfe dann mit dem NEUEN Sitzungscookie
   * ein und trüge das ALTE Fahrzeug — dem neuen Kärtchen zugeschrieben, auf
   * das Ziel der vorigen Schicht gebucht. Der Bestand wäre still falsch.
   *
   * Deshalb ist das Cookie hier die Wahrheit und die Nutzlast die Behauptung:
   * gebucht wird nur, wenn beide übereinstimmen.
   */
  it("lehnt ein Ziel ab, das nicht dem GEMERKTEN dieser Sitzung entspricht", async () => {
    zielCookie = "tk1|verbrauch";   // gemerkt ist Verbrauch …

    const erg = await bucheEntnahmeHelfer(
      // … die veraltete Seite schickt aber ein Fahrzeug.
      { artikelId: "art-1", menge: 2, ziel: { art: "fahrzeug", lagerortId: "fz-1" } }, t.db);

    expect(erg.ok).toBe(false);
    expect(helferFehler(erg).grund).toBe("eingabe");
    expect(geschrieben()).toEqual([]);
    expect(revalidiert).toEqual([]);
  });

  it("lehnt ein Ziel ab, das dem Kärtchen einer ANDEREN Schicht gehört", async () => {
    // Dasselbe Fahrzeug, aber gemerkt hat es eine andere Sitzung — auf dem
    // geteilten Telefon der häufigere Hergang.
    zielCookie = "tk-vorige|fz:fz-1";

    const erg = await bucheEntnahmeHelfer(
      { artikelId: "art-1", menge: 2, ziel: { art: "fahrzeug", lagerortId: "fz-1" } }, t.db);

    expect(erg.ok).toBe(false);
    expect(helferFehler(erg).grund).toBe("eingabe");
    expect(geschrieben()).toEqual([]);
  });

  it("lehnt ab, wenn GAR NICHTS gemerkt ist — auch bei tadelloser Nutzlast", async () => {
    zielCookie = undefined;

    const erg = await bucheEntnahmeHelfer(
      { artikelId: "art-1", menge: 2, ziel: VERBRAUCH }, t.db);

    expect(erg.ok).toBe(false);
    expect(helferFehler(erg).grund).toBe("eingabe");
    expect(geschrieben()).toEqual([]);
  });

  it("fragt den ADMIN-Riegel NICHT — der Helfer-Weg bucht auch ohne ihn", async () => {
    /*
     * VERHALTENStest statt Quelltext-Scan: ein Scan auf die Schreibweise
     * `requireLagerbuchAdmin` fixierte nur einen Namen und bliebe bei jeder
     * Umbenennung gruen. Hier WIRFT der Admin-Riegel — genau wie in Produktion
     * bei fehlender Gruppe (`notFound()`/`redirect()`).
     */
    adminRiegel.mockRejectedValue(new Error("kein Admin"));

    // Die Gegenprobe zuerst: der Mock ist scharf. Ohne sie waere die
    // Zusicherung darunter auch dann gruen, wenn der Riegel gar nichts taete.
    await expect(
      bucheZugang({ artikelId: "art-1", menge: 1, chargeId: "ch-1" }, t.db),
    ).rejects.toThrow("kein Admin");
    // ⚠️ Und die zweite Verwaltungs-Action GENAUSO. Ohne diese Zeile haenge
    // ihr Riegel allein an `_actions/guards.test.ts` — einer Datei, die bis
    // Teil 6 eingefroren ist und deren `toEqual([])` auch dann gruen ist, wenn
    // der Scan gar nichts aufgezaehlt hat.
    await expect(
      bucheEntnahme({ artikelId: "art-1", menge: 1 }, t.db),
    ).rejects.toThrow("kein Admin");

    const erg = await bucheEntnahmeHelfer(
      { artikelId: "art-1", menge: 1, ziel: VERBRAUCH }, t.db);
    expect(erg.ok).toBe(true);
    expect(adminRiegel).toHaveBeenCalledTimes(2); // nur die beiden Verwaltungswege oben
    expect(riegel).toHaveBeenCalledTimes(1);
  });
});

it("audit attributes the real helper mutation to confirmed shared access without the code", async () => {
  t.sqlite.exec("DELETE FROM audit_outbox");
  expect((await bucheEntnahmeHelfer(
    { artikelId: "art-1", menge: 2, ziel: VERBRAUCH }, t.db)).ok).toBe(true);
  const rows = t.sqlite.prepare("SELECT actor FROM audit_outbox").all() as { actor: string }[];
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) expect(JSON.parse(row.actor)).toEqual({ kind: "access", id: "lagerbuch:token:tk1", name: "Gemeinsamer Zugangscode" });
  expect(JSON.stringify(rows)).not.toContain(ZUGANG_OK.zugang.code);
});

/**
 * DRK-338 — DAS UMLAGERN ZWISCHEN ZWEI ORTEN DES HANDLAGERS.
 *
 * Was diese Faelle tragen, und warum jeweils GENAU DIESER:
 *
 *   - Die CHARGE bleibt dieselbe und die HANDLAGER-SUMME aendert sich nicht.
 *     Beides zusammen, nicht einzeln: die Summe allein waere auch dann gruen,
 *     wenn gar nichts gebucht wurde, die Charge allein auch dann, wenn zwei
 *     Zeilen mit gleichem Vorzeichen entstuenden.
 *   - FEFO WAEHLT DIE CHARGE NICHT. Der Traeger ist ein Schrank mit einer
 *     frueher und einer spaeter verfallenden Charge: gewaehlt wird die
 *     SPAETERE. Ohne den `chargeId`-Durchgriff buchte die Umlagerung still die
 *     frueh verfallende um — Netto bleibt null, der Handlager-Bestand stimmt,
 *     und nur die Ortsangabe je Charge ist falsch. Append-only: nicht heilbar.
 *   - Der QUELLORT ist einelementig. Traeger: dieselbe Charge liegt in ZWEI
 *     Schraenken; gebucht wird nur aus dem gewaehlten. Ein Bereich statt eines
 *     Ortes holte sich die Menge still aus dem Nachbarschrank.
 *   - Eine ZU GROSSE Menge rollt ALLES zurueck. Zugesichert wird nicht nur der
 *     Fehler (der kaeme auch aus einem Tippfehler im Schema), sondern dass
 *     KEINE Zeile steht.
 *   - Ein FAHRZEUG ist weder Quelle noch Ziel — sonst aenderte sich die
 *     Handlager-Summe doch, und der Fremdschluessel liesse es klaglos durch.
 *   - Aus einem STILLGELEGTEN Schrank darf man heraus, hinein nicht. Genau
 *     dafuer legt man einen Schrank stille.
 */
describe("bucheUmlagerung (DRK-338)", () => {
  /** Die Handlager-Summe ueber alle Orte des Bereichs — die Zusage aus AK 2. */
  function handlagerSumme(): number {
    return t.db.select().from(buchungen).all()
      .filter((b) => [HANDLAGER_ID, "schrank-1", "schrank-2", "schrank-alt"].includes(b.lagerortId))
      .reduce((s, b) => s + b.menge, 0);
  }
  function bestandAn(ortId: string, chargeId?: string): number {
    return t.db.select().from(buchungen).all()
      .filter((b) => b.lagerortId === ortId && (!chargeId || b.chargeId === chargeId))
      .reduce((s, b) => s + b.menge, 0);
  }

  beforeEach(() => {
    t.db.insert(lagerorte).values([
      { id: "schrank-1", name: "Schrank 1", typ: "lager", parentId: HANDLAGER_ID,
        aktiv: true, sortierung: 10 },
      { id: "schrank-2", name: "GF-Schrank", typ: "lager", parentId: HANDLAGER_ID,
        aktiv: true, sortierung: 90 },
      { id: "schrank-alt", name: "Schrank alt", typ: "lager", parentId: HANDLAGER_ID,
        aktiv: false, sortierung: 50 },
    ]).run();
    // Eine ZWEITE Charge desselben Artikels, die FRUEHER verfaellt als `ch-1`
    // (2027-03) — sie ist der Traeger der FEFO-Zusage.
    t.db.insert(chargen).values([
      { id: "ch-frueh", artikelId: "art-1", chargenNr: "L0", verfall: "2026-09",
        createdAt: JETZT },
    ]).run();
    t.db.insert(buchungen).values([
      { id: "b-s1-spaet", ts: JETZT, typ: "zugang", artikelId: "art-1", chargeId: "ch-1",
        lagerortId: "schrank-1", menge: 6, quelleTyp: "system", quelleId: "seed",
        referenz: null, kommentar: null },
      { id: "b-s1-frueh", ts: JETZT, typ: "zugang", artikelId: "art-1", chargeId: "ch-frueh",
        lagerortId: "schrank-1", menge: 4, quelleTyp: "system", quelleId: "seed",
        referenz: null, kommentar: null },
      // DIESELBE Charge ein zweites Mal — im stillgelegten Schrank.
      { id: "b-alt-spaet", ts: JETZT, typ: "zugang", artikelId: "art-1", chargeId: "ch-1",
        lagerortId: "schrank-alt", menge: 3, quelleTyp: "system", quelleId: "seed",
        referenz: null, kommentar: null },
    ]).run();
  });

  it("verschiebt die Menge und laesst die Handlager-Summe unveraendert", async () => {
    const vorher = handlagerSumme();
    const erg = await bucheUmlagerung(
      { artikelId: "art-1", chargeId: "ch-1", vonLagerortId: "schrank-1",
        nachLagerortId: "schrank-2", menge: 5 },
      t.db,
    );
    expect(erg.ok).toBe(true);
    expect(handlagerSumme()).toBe(vorher);
    expect(bestandAn("schrank-1", "ch-1")).toBe(1);
    expect(bestandAn("schrank-2", "ch-1")).toBe(5);
  });

  it("schreibt beide Legs als `umlagerung` mit derselben Charge und Referenz", async () => {
    await bucheUmlagerung(
      { artikelId: "art-1", chargeId: "ch-1", vonLagerortId: "schrank-1",
        nachLagerortId: "schrank-2", menge: 5 },
      t.db,
    );
    const neu = geschrieben();
    expect(neu).toHaveLength(2);
    for (const zeile of neu) {
      expect(zeile.typ).toBe("umlagerung");
      expect(zeile.chargeId).toBe("ch-1");
      expect(zeile.referenz).toBe("umlagerung:schrank-2");
    }
    expect(neu.map((b) => `${b.lagerortId}:${b.menge}`).sort())
      .toEqual(["schrank-1:-5", "schrank-2:5"]);
  });

  /**
   * ⚠️ DER TRAEGER DES GANZEN TICKETS. `ch-frueh` verfaellt 2026-09 und `ch-1`
   * erst 2027-03; FEFO griffe also zur frueheren. Gewaehlt wird die spaetere —
   * und genau die muss wandern, denn sie ist die, die jemand in der Hand hatte.
   */
  it("bucht die GEWAEHLTE Charge um, nicht die nach FEFO aelteste", async () => {
    await bucheUmlagerung(
      { artikelId: "art-1", chargeId: "ch-1", vonLagerortId: "schrank-1",
        nachLagerortId: "schrank-2", menge: 2 },
      t.db,
    );
    expect(bestandAn("schrank-2", "ch-1")).toBe(2);
    expect(bestandAn("schrank-2", "ch-frueh")).toBe(0);
    expect(bestandAn("schrank-1", "ch-frueh")).toBe(4);
  });

  /**
   * Dieselbe Charge liegt in `schrank-1` (6) UND in `schrank-alt` (3). Gebucht
   * werden 6 aus `schrank-1` — ginge die Quelle als BEREICH hinein, holte sich
   * FEFO den Rest still aus dem Nachbarschrank.
   */
  it("nimmt ausschliesslich aus dem gewaehlten Quellort", async () => {
    const erg = await bucheUmlagerung(
      { artikelId: "art-1", chargeId: "ch-1", vonLagerortId: "schrank-1",
        nachLagerortId: "schrank-2", menge: 6 },
      t.db,
    );
    expect(erg.ok).toBe(true);
    expect(bestandAn("schrank-1", "ch-1")).toBe(0);
    expect(bestandAn("schrank-alt", "ch-1")).toBe(3);
  });

  it("rollt eine zu grosse Menge VOLLSTAENDIG zurueck und nennt den vorhandenen Rest", async () => {
    const erg = await bucheUmlagerung(
      { artikelId: "art-1", chargeId: "ch-1", vonLagerortId: "schrank-1",
        nachLagerortId: "schrank-2", menge: 7 },
      t.db,
    );
    expect(erg.ok).toBe(false);
    expect(fehlerVon(erg)).toContain("Schrank 1");
    expect(fehlerVon(erg)).toContain("6");
    // ⚠️ NICHT NUR DER FEHLER: eine teilweise gebuchte Umlagerung liesse den
    // Buchstand an BEIDEN Orten falsch stehen.
    expect(geschrieben()).toHaveLength(0);
  });

  it("weist ein Fahrzeug als Ziel ab", async () => {
    const erg = await bucheUmlagerung(
      { artikelId: "art-1", chargeId: "ch-1", vonLagerortId: "schrank-1",
        nachLagerortId: "fz-1", menge: 1 },
      t.db,
    );
    expect(erg.ok).toBe(false);
    expect(fehlerVon(erg)).toContain("Handlager");
    expect(geschrieben()).toHaveLength(0);
  });

  it("weist ein Fahrzeug als Quelle ab", async () => {
    const erg = await bucheUmlagerung(
      { artikelId: "art-1", chargeId: "ch-1", vonLagerortId: "fz-1",
        nachLagerortId: "schrank-2", menge: 1 },
      t.db,
    );
    expect(erg.ok).toBe(false);
    expect(geschrieben()).toHaveLength(0);
  });

  it("laesst aus einem stillgelegten Schrank HERAUS umlagern", async () => {
    const erg = await bucheUmlagerung(
      { artikelId: "art-1", chargeId: "ch-1", vonLagerortId: "schrank-alt",
        nachLagerortId: "schrank-2", menge: 3 },
      t.db,
    );
    expect(erg.ok).toBe(true);
    expect(bestandAn("schrank-alt", "ch-1")).toBe(0);
    expect(bestandAn("schrank-2", "ch-1")).toBe(3);
  });

  it("weist einen stillgelegten Schrank als ZIEL ab", async () => {
    const erg = await bucheUmlagerung(
      { artikelId: "art-1", chargeId: "ch-1", vonLagerortId: "schrank-1",
        nachLagerortId: "schrank-alt", menge: 1 },
      t.db,
    );
    expect(erg.ok).toBe(false);
    expect(fehlerVon(erg)).toContain("stillgelegt");
    expect(geschrieben()).toHaveLength(0);
  });

  /** I5 — dieselbe Zusage wie beim Zugang, aus demselben Grund. */
  it("weist eine Charge ab, die zu einem anderen Artikel gehoert", async () => {
    t.db.insert(chargen).values([
      { id: "ch-fremd", artikelId: "art-2", chargenNr: "X", verfall: "2027-01",
        createdAt: JETZT },
    ]).run();
    const erg = await bucheUmlagerung(
      { artikelId: "art-1", chargeId: "ch-fremd", vonLagerortId: "schrank-1",
        nachLagerortId: "schrank-2", menge: 1 },
      t.db,
    );
    expect(erg.ok).toBe(false);
    expect(geschrieben()).toHaveLength(0);
  });

  it("weist Quelle gleich Ziel am Feld ab", async () => {
    const erg = await bucheUmlagerung(
      { artikelId: "art-1", chargeId: "ch-1", vonLagerortId: "schrank-1",
        nachLagerortId: "schrank-1", menge: 1 },
      t.db,
    );
    expect(erg.ok).toBe(false);
    expect(feldFehlerVon(erg)?.nachLagerortId).toBeTruthy();
    expect(geschrieben()).toHaveLength(0);
  });

  it("fragt den Admin-Riegel", async () => {
    adminRiegel.mockRejectedValueOnce(new Error("kein Admin"));
    await expect(bucheUmlagerung(
      { artikelId: "art-1", chargeId: "ch-1", vonLagerortId: "schrank-1",
        nachLagerortId: "schrank-2", menge: 1 },
      t.db,
    )).rejects.toThrow("kein Admin");
    expect(geschrieben()).toHaveLength(0);
  });
});
