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

import { bucheZugang, bucheEntnahme, bucheEntnahmeHelfer } from "./buchung";

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

const JETZT = new Date("2026-06-15T10:00:00Z");

beforeEach(() => {
  revalidiert.length = 0;
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

describe("bucheEntnahmeHelfer", () => {
  it("bucht mit quelleTyp token und dem CODE als quelleId", async () => {
    const erg = await bucheEntnahmeHelfer({ artikelId: "art-1", menge: 2 }, t.db);

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
    const erg = await bucheEntnahmeHelfer({ artikelId: "art-2", menge: 1 }, t.db);

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

    const erg = await bucheEntnahmeHelfer({ artikelId: "art-1", menge: 1 }, t.db);
    expect(erg.ok).toBe(true);
    expect(adminRiegel).toHaveBeenCalledTimes(2); // nur die beiden Verwaltungswege oben
    expect(riegel).toHaveBeenCalledTimes(1);
  });
});
