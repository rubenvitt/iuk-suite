import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import { artikel, buchungen, chargen, lagerorte, lagerortVerfall } from "../_db/schema";
import { ENTNAHMEBOX_ID, ENTNAHMEBOX_KOMMENTAR, PSEUDO_VERFALL } from "../_lib/konstanten";
import { ENTNAHMEBOX_PRAEFIX } from "../_lib/vorgang";
import { setzeVerfall } from "../_lib/schreibpfade/lagerortVerfall";

/**
 * DIE ABGABE IN DIE ENTNAHMEBOX — DRK-314.
 *
 * ⚠️ GEGEN EINE ECHTE, MIGRIERTE SQLITE. Das ist hier nicht Gruendlichkeit,
 * sondern die einzige Stelle, an der die tragende Zusage ueberhaupt PRUEFBAR
 * ist: „der Abgang in der Einheit und der Zugang in der Box bilden denselben
 * Vorgang ab" (Akzeptanzkriterium 3) ist eine Aussage ueber ZWEI Zeilen mit
 * DERSELBEN Referenz und DERSELBEN Charge — ein Mock der Schreibpfade
 * behauptete sie, statt sie zu messen.
 *
 * ⚠️ UND MIT DER MIGRATION, nicht mit einer von Hand angelegten Box-Zeile. Dass
 * `0012_entnahmebox.sql` ueberhaupt laeuft und die Zeile mit `typ = 'lager'` und
 * `parent_id IS NULL` anlegt, ist selbst Teil der Zusage: haengt sie eines Tages
 * unter dem Handlager, zaehlt ihr Inhalt still als Handlagerbestand.
 */

const { helferRiegel, revalidiert, sitzung } = vi.hoisted(() => ({
  helferRiegel: vi.fn<() => Promise<unknown>>(),
  revalidiert: [] as string[],
  /**
   * DIE ANGEMELDETE VERWALTUNG — getrennt vom Riegel, und genau darum geht es.
   *
   * ⚠️ DER RIEGEL SAGT NICHT, OB JEMAND ANGEMELDET IST.
   * `requireHelferSchreibend` prueft das KAERTCHEN ZUERST
   * (`_lib/helferZugang.ts`) und steigt mit `herkunft: "token"` aus, sobald ein
   * gueltiges Kaertchen-Cookie da ist — auch bei einer Verwalterin, die
   * daneben angemeldet ist. Wer die Verwaltungserlaubnis am Riegel ablaese,
   * saehe diese Person als Helferin. Deshalb steht hier eine ZWEITE, davon
   * unabhaengige Grosse.
   */
  sitzung: {
    konto: null as unknown,
    /*
     * ⚠️ DER HAKEN IM `await` SELBST — der einzige Weg, das Wettlauffenster
     * ueberhaupt zu treffen. Zwischen dem Vorabblick auf `aktiv` und der
     * Transaktion liegt genau ein `await`: das Aufloesen der Verwaltung. Was
     * hier laeuft, laeuft also NACH der Entscheidung ueber die Kennung und VOR
     * der Probe, die in der Transaktion steht.
     */
    beimAufloesen: null as (() => void) | null,
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: (pfad: string) => { revalidiert.push(pfad); },
}));

/*
 * ⚠️ ZWEI EINSTIEGE AUS DEMSELBEN MODUL, und sie sind absichtlich getrennt
 * steuerbar: `requireHelferSchreibend` beantwortet „darf hier ueberhaupt jemand
 * buchen?", `kontoZugangOderNull` „bringt eine angemeldete Verwaltung die
 * zusaetzliche Erlaubnis mit?". Die echte Fassung des zweiten haengt an
 * `SUITE_ADMIN_GROUP_LAGERBUCH` und an `merkeNutzer`; ein Test, der sie ruft,
 * pruefte die Umgebung statt die Action.
 */
vi.mock("../_lib/helferZugang", () => ({
  requireHelferSchreibend: () => helferRiegel(),
  kontoZugangOderNull: async () => {
    sitzung.beimAufloesen?.();
    return sitzung.konto;
  },
}));

vi.mock("../_db/client", () => ({
  getDb: () => { throw new Error("getDb() im Test — jeder Aufruf uebergibt t.db"); },
}));

import { bucheInEntnahmebox } from "./entnahmebox";

const JETZT = new Date("2026-09-16T10:00:00Z");

/** Der Kaertchen-Weg: `quelleTyp: "token"`, `quelleId` ist der CODE im Klartext. */
const KAERTCHEN = {
  ok: true as const,
  zugang: {
    herkunft: "token" as const,
    tokenId: "tk-1",
    code: "123-456",
    label: "RTW 1",
    laeuftAb: new Date("2026-09-16T22:00:00Z"),
    fahrzeugBindung: null,
  },
};

/** Der Konto-Weg: `quelleTyp: "oidc"`, `quelleId` ist der `sub`. */
const KONTO = {
  ok: true as const,
  zugang: {
    herkunft: "konto" as const,
    sub: "u-admin",
    name: "A. Verwaltung",
    laeuftAb: null,
    fahrzeugBindung: null,
  },
};

/**
 * Die Sitzung der Verwalterin — UNABHAENGIG davon, was der Riegel zurueckgibt.
 * Dieselbe Form wie `KONTO.zugang`: sie geht als `HelferZugang` in
 * `journalQuelle` und `zugangsAkteur`.
 */
const VERWALTUNG = KONTO.zugang;

let t: TestDb;

beforeEach(() => {
  revalidiert.length = 0;
  helferRiegel.mockResolvedValue(KAERTCHEN);
  sitzung.konto = null;
  sitzung.beimAufloesen = null;
  t = migrierteTestDb("lagerbuch-actions-entnahmebox-");

  t.db.insert(lagerorte).values({
    id: "fz-1", name: "RTW 1", typ: "fahrzeug", aktiv: true, einheitenart: "fahrzeug",
  }).run();
  t.db.insert(lagerorte).values({
    id: "ta-1", name: "Rucksack Betreuung", typ: "fahrzeug", aktiv: true, einheitenart: "tasche",
  }).run();
  t.db.insert(artikel).values({
    id: "art-1", name: "Kühlkompresse", einheit: "Stk", fach: "A-01",
    mindestbestand: 1, aktiv: true, createdAt: JETZT, kategorie: null, bestelltAt: null,
  }).run();
  t.db.insert(artikel).values({
    id: "art-2", name: "Mullbinde", einheit: "Pkg.", fach: "A-02",
    mindestbestand: 1, aktiv: true, createdAt: JETZT, kategorie: null, bestelltAt: null,
  }).run();
});

function charge(id: string, verfall: string, artikelId = "art-1") {
  t.db.insert(chargen).values({
    id, artikelId, chargenNr: id, verfall, createdAt: JETZT,
  }).run();
}

function buchen(id: string, chargeId: string, menge: number, ort = "fz-1", artikelId = "art-1") {
  t.db.insert(buchungen).values({
    id, ts: JETZT, typ: "zugang", artikelId, chargeId,
    lagerortId: ort, menge, quelleTyp: "system", quelleId: "seed",
    referenz: null, kommentar: null,
  }).run();
}

/** Bestand je (Ort, Charge) ueber ALLE Buchungen. */
/**
 * Die Verfallszeilen EINES Orts — die Kompensationstabelle, nicht die Chargen.
 * Vorgabe ist die Quelleinheit; seit DRK-377 wird auch die Box danach gefragt.
 */
function verfallZeilen(ortId = "fz-1") {
  return t.db.select().from(lagerortVerfall)
    .where(eq(lagerortVerfall.lagerortId, ortId)).all();
}

function bestand(ort: string, chargeId: string): number {
  return t.db.select().from(buchungen).all()
    .filter((b) => b.lagerortId === ort && b.chargeId === chargeId)
    .reduce((s, b) => s + b.menge, 0);
}

function neueZeilen() {
  return t.db.select().from(buchungen).all().filter((b) => b.quelleId !== "seed");
}

describe("bucheInEntnahmebox — die Umbuchung", () => {
  it("bildet Abgang und Zugang als EIN Vorgang ab: zwei Legs, eine Referenz, eine Charge", async () => {
    charge("ch-1", "2030-01");
    buchen("seed-1", "ch-1", 10);

    const erg = await bucheInEntnahmebox(
      { fahrzeugId: "fz-1", artikelId: "art-1", menge: 4 },
      t.db,
    );

    expect(erg).toEqual({ ok: true, wert: { gebucht: 4 } });

    const zeilen = neueZeilen();
    expect(zeilen).toHaveLength(2);

    // ⚠️ NETTO NULL — die Invariante jeder Umlagerung (I3). Waere sie verletzt,
    // entstuende oder verschwaende Bestand, und die Summe aller Buchungen des
    // Artikels waere nicht mehr gleich.
    expect(zeilen.reduce((s, b) => s + b.menge, 0)).toBe(0);

    const ab = zeilen.find((b) => b.lagerortId === "fz-1")!;
    const zu = zeilen.find((b) => b.lagerortId === ENTNAHMEBOX_ID)!;
    expect(ab.menge).toBe(-4);
    expect(zu.menge).toBe(4);

    // BEIDE Legs tragen `umlagerung` — nicht zugang/entnahme. Sonst laese der
    // Bestellvorschlag die Abgabe als Verbrauch und der Wareneingangsbericht
    // den Zugang als Lieferung.
    expect(ab.typ).toBe("umlagerung");
    expect(zu.typ).toBe("umlagerung");

    // DIE KLAMMER: dieselbe Referenz, und sie nennt die QUELLE.
    expect(ab.referenz).toBe(`${ENTNAHMEBOX_PRAEFIX}fz-1`);
    expect(zu.referenz).toBe(ab.referenz);

    // DIE VERFALL-PROVENIENZ WANDERT MIT: gleiche Charge auf beiden Seiten.
    expect(ab.chargeId).toBe("ch-1");
    expect(zu.chargeId).toBe("ch-1");

    // Der Kommentar ist festgenagelt und steht damit in der Journalspalte.
    expect(zu.kommentar).toBe(ENTNAHMEBOX_KOMMENTAR);

    expect(bestand("fz-1", "ch-1")).toBe(6);
    expect(bestand(ENTNAHMEBOX_ID, "ch-1")).toBe(4);
  });

  it("nimmt ohne Chargenangabe die zuerst ablaufende (FEFO)", async () => {
    charge("ch-alt", "2027-01");
    charge("ch-neu", "2030-01");
    buchen("seed-alt", "ch-alt", 2);
    buchen("seed-neu", "ch-neu", 8);

    await bucheInEntnahmebox({ fahrzeugId: "fz-1", artikelId: "art-1", menge: 3 }, t.db);

    // Zwei aus der alten, eine aus der jungen — und in der Box dieselbe
    // Verteilung, nicht drei Stueck auf einer geratenen Charge.
    expect(bestand(ENTNAHMEBOX_ID, "ch-alt")).toBe(2);
    expect(bestand(ENTNAHMEBOX_ID, "ch-neu")).toBe(1);
    expect(bestand("fz-1", "ch-alt")).toBe(0);
    expect(bestand("fz-1", "ch-neu")).toBe(7);
  });

  it("bucht MIT Chargenangabe genau diese — auch wenn eine aeltere daneben liegt", async () => {
    // ⚠️ DER FALL, DEN FEFO FALSCH MACHEN WUERDE. Wer die Packung in der Hand
    // haelt, traegt DIESE in die Kiste; FEFO ist eine ENTNAHME-Regel und gilt
    // beim Umraeumen nicht (`_lib/schreibpfade/umlagerung.ts`). Der Fehler waere
    // STILL: netto bleibt null, der Fahrzeugbestand stimmt, und trotzdem
    // stuende in der Box eine andere Charge als die, die physisch gewandert ist.
    charge("ch-alt", "2027-01");
    charge("ch-neu", "2030-01");
    buchen("seed-alt", "ch-alt", 5);
    buchen("seed-neu", "ch-neu", 5);

    await bucheInEntnahmebox(
      { fahrzeugId: "fz-1", artikelId: "art-1", menge: 2, chargeId: "ch-neu" },
      t.db,
    );

    expect(bestand(ENTNAHMEBOX_ID, "ch-neu")).toBe(2);
    expect(bestand(ENTNAHMEBOX_ID, "ch-alt")).toBe(0);
    expect(bestand("fz-1", "ch-alt")).toBe(5);
  });

  it("nimmt auch aus einer Tasche", async () => {
    charge("ch-1", "2030-01");
    buchen("seed-1", "ch-1", 3, "ta-1");

    const erg = await bucheInEntnahmebox(
      { fahrzeugId: "ta-1", artikelId: "art-1", menge: 3 },
      t.db,
    );

    expect(erg.ok).toBe(true);
    expect(bestand("ta-1", "ch-1")).toBe(0);
    expect(bestand(ENTNAHMEBOX_ID, "ch-1")).toBe(3);
  });
});

describe("bucheInEntnahmebox — die Quelle der Buchung", () => {
  it("schreibt beim Kaertchen den CODE mit quelleTyp token", async () => {
    charge("ch-1", "2030-01");
    buchen("seed-1", "ch-1", 5);

    await bucheInEntnahmebox({ fahrzeugId: "fz-1", artikelId: "art-1", menge: 1 }, t.db);

    for (const b of neueZeilen()) {
      expect(b.quelleTyp).toBe("token");
      // ⚠️ DER CODE IM KLARTEXT, NICHT DIE TOKEN-ID. Ein umkodierter Code macht
      // das gesamte historische Journal namenlos (`_db/quelle.ts`).
      expect(b.quelleId).toBe("123-456");
    }
  });

  it("schreibt beim angemeldeten Konto den sub mit quelleTyp oidc", async () => {
    helferRiegel.mockResolvedValue(KONTO);
    charge("ch-1", "2030-01");
    buchen("seed-1", "ch-1", 5);

    await bucheInEntnahmebox({ fahrzeugId: "fz-1", artikelId: "art-1", menge: 1 }, t.db);

    for (const b of neueZeilen()) {
      expect(b.quelleTyp).toBe("oidc");
      expect(b.quelleId).toBe("u-admin");
    }
  });
});

describe("bucheInEntnahmebox — was sie ablehnt", () => {
  it("weist den gesperrten Zugang ab, BEVOR sie etwas liest", async () => {
    helferRiegel.mockResolvedValue({ ok: false, grund: "gesperrt", nochAngemeldet: false });

    const erg = await bucheInEntnahmebox(
      { fahrzeugId: "fz-1", artikelId: "art-1", menge: 1 },
      t.db,
    );

    expect(erg.ok).toBe(false);
    expect(erg.ok === false && erg.grund).toBe("gesperrt");
    expect(neueZeilen()).toHaveLength(0);
  });

  it("bucht NICHTS, wenn die Menge nicht gedeckt ist — statt still zu kappen", async () => {
    /*
     * ⚠️ DER UNTERSCHIED ZUR ENTNAHME, UND ER IST FACHLICH. `fefoAbbuchung`
     * kappt still an der Verfuegbarkeit; fuer eine Entnahme ist das richtig
     * (was nicht da ist, kann man nicht nehmen). Hier behauptete es etwas ueber
     * die WIRKLICHKEIT: die Person hat fuenf Teile in die Kiste gelegt, gebucht
     * waeren drei, und die uebrigen zwei stuenden weiter auf dem Fahrzeug — der
     * Buchstand waere an BEIDEN Orten falsch, und niemand bekaeme es gesagt.
     */
    charge("ch-1", "2030-01");
    buchen("seed-1", "ch-1", 3);

    const erg = await bucheInEntnahmebox(
      { fahrzeugId: "fz-1", artikelId: "art-1", menge: 5 },
      t.db,
    );

    expect(erg.ok).toBe(false);
    // Die Meldung nennt die Zahl UND die Einheit des Artikels — kein erfundenes
    // „Stück", das Modul fuehrt die Einheit als freien Text.
    expect(erg.ok === false && erg.text).toContain("nur 3 Stk");
    expect(erg.ok === false && erg.text).toContain("aus diesem Fahrzeug");
    expect(neueZeilen()).toHaveLength(0);
    expect(bestand("fz-1", "ch-1")).toBe(3);
  });

  it("prueft die Deckung je CHARGE, nicht nur je Artikel", async () => {
    charge("ch-alt", "2027-01");
    charge("ch-neu", "2030-01");
    buchen("seed-alt", "ch-alt", 8);
    buchen("seed-neu", "ch-neu", 1);

    const erg = await bucheInEntnahmebox(
      { fahrzeugId: "fz-1", artikelId: "art-1", menge: 3, chargeId: "ch-neu" },
      t.db,
    );

    expect(erg.ok).toBe(false);
    expect(erg.ok === false && erg.text).toContain("Von dieser Charge");
    expect(neueZeilen()).toHaveLength(0);
  });

  it("lehnt eine Charge ab, die einem anderen Artikel gehoert (I5)", async () => {
    // Ohne diese Probe buchte eine manipulierte Anfrage gegen den Bestand eines
    // ANDEREN Artikels — die Deckungspruefung allein faengt das nicht: sie
    // fragte nach dem Rest dieser Charge unter `artikelId`, und der ist 0,
    // waere also nur zufaellig dieselbe Ablehnung.
    charge("ch-fremd", "2030-01", "art-2");
    buchen("seed-fremd", "ch-fremd", 9, "fz-1", "art-2");

    const erg = await bucheInEntnahmebox(
      { fahrzeugId: "fz-1", artikelId: "art-1", menge: 1, chargeId: "ch-fremd" },
      t.db,
    );

    expect(erg.ok).toBe(false);
    expect(erg.ok === false && erg.text).toContain("gehört nicht zu diesem Artikel");
    expect(neueZeilen()).toHaveLength(0);
  });

  it("nimmt NICHT aus dem Handlager — die Box ist kein Umweg um die Entnahme", async () => {
    /*
     * ⚠️ OHNE DIESE PROBE ENTSCHIEDE DER FREMDSCHLUESSEL, und der laesst JEDEN
     * Lagerort klaglos durch: 'handlager' ist eine gueltige `lagerorte.id`. Eine
     * selbst gebaute Anfrage koennte damit Handlagerbestand in die Kiste
     * schieben, ohne dass eine Entnahme im Journal stuende.
     */
    charge("ch-1", "2030-01");
    buchen("seed-1", "ch-1", 5, "handlager");

    const erg = await bucheInEntnahmebox(
      { fahrzeugId: "handlager", artikelId: "art-1", menge: 1 },
      t.db,
    );

    expect(erg.ok).toBe(false);
    expect(erg.ok === false && erg.text).toContain("Fahrzeug oder einer Tasche");
    expect(neueZeilen()).toHaveLength(0);
  });

  it("nimmt NICHT aus der Box selbst — der Rueckweg ist DRK-313, nicht dieser", async () => {
    charge("ch-1", "2030-01");
    buchen("seed-1", "ch-1", 5, ENTNAHMEBOX_ID);

    const erg = await bucheInEntnahmebox(
      { fahrzeugId: ENTNAHMEBOX_ID, artikelId: "art-1", menge: 1 },
      t.db,
    );

    expect(erg.ok).toBe(false);
    expect(neueZeilen()).toHaveLength(0);
  });

  it("bucht nichts in eine STILLGELEGTE Box", async () => {
    t.db.update(lagerorte).set({ aktiv: false })
      .where(eq(lagerorte.id, ENTNAHMEBOX_ID)).run();
    charge("ch-1", "2030-01");
    buchen("seed-1", "ch-1", 5);

    const erg = await bucheInEntnahmebox(
      { fahrzeugId: "fz-1", artikelId: "art-1", menge: 1 },
      t.db,
    );

    expect(erg.ok).toBe(false);
    expect(erg.ok === false && erg.text).toContain("stillgelegt");
    expect(neueZeilen()).toHaveLength(0);
  });

  it("nimmt AUS DER VERWALTUNG aus einer stillgelegten Einheit — genau die raeumt man aus", async () => {
    /*
     * ⚠️ DAS ZIEL MUSS AUFNAHMEBEREIT SEIN, DIE QUELLE NICHT — die
     * Gegenrichtung zur Zeile darueber. Eine ausserdienstliche Einheit ist
     * genau die, die man leerraeumt.
     */
    helferRiegel.mockResolvedValue(KONTO);
    sitzung.konto = VERWALTUNG;
    t.db.update(lagerorte).set({ aktiv: false }).where(eq(lagerorte.id, "fz-1")).run();
    charge("ch-1", "2030-01");
    buchen("seed-1", "ch-1", 5);

    const erg = await bucheInEntnahmebox(
      { fahrzeugId: "fz-1", artikelId: "art-1", menge: 5 },
      t.db,
    );

    expect(erg.ok).toBe(true);
    expect(bestand(ENTNAHMEBOX_ID, "ch-1")).toBe(5);
  });

  it("weist dieselbe Einheit beim KAERTCHEN ab — Ausraeumen ist Verwaltungssache", async () => {
    /*
     * ⚠️ DER UNTERSCHIED IST DIE HERKUNFT, NICHT DIE EINHEIT (Codex-Review zu
     * PR #175). Die Helferflaeche bietet stillgelegte Einheiten gar nicht an —
     * das stand bis hierher aber NUR in der Auswahlliste, und eine Server
     * Action ist ein eigener Einstiegspunkt. Der Test baut genau die Anfrage,
     * die keine Oberflaeche stellt.
     *
     * ⚠️ UND ES WIRD NICHTS GEBUCHT, nicht nur abgewiesen: eine halb
     * ausgefuehrte Ablehnung waere der teuerste Ausgang, weil das Journal
     * append-only ist.
     */
    t.db.update(lagerorte).set({ aktiv: false }).where(eq(lagerorte.id, "fz-1")).run();
    charge("ch-1", "2030-01");
    buchen("seed-1", "ch-1", 5);

    const erg = await bucheInEntnahmebox(
      { fahrzeugId: "fz-1", artikelId: "art-1", menge: 5 },
      t.db,
    );

    expect(erg.ok).toBe(false);
    expect((erg as { ok: false; text: string }).text).toContain("außer Dienst");
    expect(bestand(ENTNAHMEBOX_ID, "ch-1"), "nichts gebucht").toBe(0);
    expect(bestand("fz-1", "ch-1"), "und die Einheit unveraendert").toBe(5);
  });

  it("laesst die VERWALTUNG auch dann ausraeumen, wenn ihr Kaertchen noch gilt", async () => {
    /*
     * ⚠️ DER RIEGEL IST HIER `token`, UND ZWAR NICHT AUS VERSEHEN
     * (Codex-Review zu PR #175, zweite Runde). `requireHelferSchreibend`
     * prueft das KAERTCHEN ZUERST und steigt damit aus, sobald ein gueltiges
     * Kaertchen-Cookie da ist — eine Verwalterin, die vorher irgendwann eines
     * eingeloest hat, kommt also mit `herkunft: "token"` in diese Action,
     * waehrend sie in der Verwaltung sitzt.
     *
     * Die erste Fassung des Riegels fragte genau diese Herkunft ab und
     * verwehrte ihr damit die stillgelegten Einheiten, die ihre eigene Seite
     * zum Ausraeumen anbietet — mit dem Satz „Das Ausraeumen laeuft ueber die
     * Verwaltung". Der Test baut diese Lage nach: Kaertchen am Riegel,
     * Lagerbuch-Gruppe in der Sitzung.
     */
    helferRiegel.mockResolvedValue(KAERTCHEN);
    sitzung.konto = VERWALTUNG;
    t.db.update(lagerorte).set({ aktiv: false }).where(eq(lagerorte.id, "fz-1")).run();
    charge("ch-1", "2030-01");
    buchen("seed-1", "ch-1", 5);

    const erg = await bucheInEntnahmebox(
      { fahrzeugId: "fz-1", artikelId: "art-1", menge: 5 },
      t.db,
    );

    expect(erg.ok).toBe(true);
    expect(bestand(ENTNAHMEBOX_ID, "ch-1")).toBe(5);

    /*
     * ⚠️ UND SIE STEHT AUCH IN DER ZEILE (Codex-Review zu PR #178, P1). Die
     * Erlaubnis kam aus der Verwaltung, der Riegel aber aus dem Kaertchen —
     * wuerde die Kennung dem Riegel folgen, waere ein Vorgang, den NUR die
     * Verwaltung ausloesen darf, auf den GEMEINSAMEN Zugangscode gebucht.
     * `quelleTyp: "token"` traegt den Code im Klartext und loest ueber
     * `tokens.code` auf; das Journal ist append-only, die Zeile bliebe fuer
     * immer falsch, und zwar still.
     *
     * Geprueft werden BEIDE Legs: Abgang und Zugang sind derselbe Vorgang, und
     * eine halbe Zuschreibung waere die teuerste Auskunft von allen.
     */
    const legs = neueZeilen();
    expect(legs.length, "Abgang und Zugang").toBe(2);
    for (const leg of legs) {
      expect(leg.quelleTyp, "die Verwaltung bucht, nicht das Kaertchen").toBe("oidc");
      expect(leg.quelleId).toBe(KONTO.zugang.sub);
    }
  });

  it("weist ab, wenn die Einheit waehrend des Aufloesens WIEDER IN DIENST geht", async () => {
    /*
     * ⚠️ DAS UNAUFFAELLIGERE ENDE DESSELBEN WETTLAUFS (Codex-Review zu PR #178,
     * P2). Der Vorabblick sieht eine stillgelegte Einheit und legt die Kennung
     * auf die Verwaltung fest; waehrend die Sitzung aufgeloest wird, stellt
     * jemand die Einheit wieder in Dienst. Die Transaktion saehe dann eine
     * voellig gewoehnliche Abgabe aus einer AKTIVEN Einheit — gebucht unter dem
     * KLARNAMEN der Verwaltung statt unter dem Kaertchen, und damit genau
     * andersherum als die Zeile darunter zusichert.
     *
     * ⚠️ NICHT DIE BUCHUNG IST FALSCH, SONDERN DIE ZEILE — das ist der Grund,
     * warum hier abgewiesen und nicht stillschweigend umgeschrieben wird: die
     * Kennung liegt im Protokoll laengst fest, und das Journal ist append-only.
     * Die Person laedt neu und bucht erneut.
     */
    helferRiegel.mockResolvedValue(KAERTCHEN);
    sitzung.konto = VERWALTUNG;
    t.db.update(lagerorte).set({ aktiv: false }).where(eq(lagerorte.id, "fz-1")).run();
    sitzung.beimAufloesen = () => {
      t.db.update(lagerorte).set({ aktiv: true }).where(eq(lagerorte.id, "fz-1")).run();
    };
    charge("ch-1", "2030-01");
    buchen("seed-1", "ch-1", 5);

    const erg = await bucheInEntnahmebox(
      { fahrzeugId: "fz-1", artikelId: "art-1", menge: 5 },
      t.db,
    );

    expect(erg.ok).toBe(false);
    expect((erg as { ok: false; text: string }).text).toContain("wieder in Dienst");
    expect(neueZeilen(), "nichts gebucht").toHaveLength(0);
  });

  it("bucht eine GEWOEHNLICHE Abgabe weiter auf das Kaertchen", async () => {
    /*
     * ⚠️ DIE GEGENRICHTUNG ZUR ZEILE DARUEBER, und sie ist der Grund, warum die
     * Kennung nur bei STILLGELEGTER Quelle wechselt. Zoege man sie immer aufs
     * Konto, sobald eines da ist, traegt der Klarname jeder Verwaltenden jede
     * Buchung, die sie am Fahrzeug mit der Karte macht — waehrend die Buchung
     * einer Kollegin ohne Konto daneben anonym bleibt. Die Kennung wechselt
     * genau dort, wo die zusaetzliche Erlaubnis greift, und sonst nirgends.
     */
    helferRiegel.mockResolvedValue(KAERTCHEN);
    sitzung.konto = VERWALTUNG;
    charge("ch-1", "2030-01");
    buchen("seed-1", "ch-1", 5);

    const erg = await bucheInEntnahmebox(
      { fahrzeugId: "fz-1", artikelId: "art-1", menge: 5 },
      t.db,
    );

    expect(erg.ok).toBe(true);
    for (const leg of neueZeilen()) {
      expect(leg.quelleTyp).toBe("token");
      expect(leg.quelleId).toBe(KAERTCHEN.zugang.code);
    }
  });

  it("laesst eine AKTIVE Einheit beim Kaertchen unveraendert durch", async () => {
    // Die Gegenprobe: der neue Riegel darf den gewoehnlichen Weg nicht treffen.
    charge("ch-1", "2030-01");
    buchen("seed-1", "ch-1", 5);

    const erg = await bucheInEntnahmebox(
      { fahrzeugId: "fz-1", artikelId: "art-1", menge: 5 },
      t.db,
    );

    expect(erg.ok).toBe(true);
  });

  it("weist eine Menge von 0 oder weniger am Eingangsvalidator ab", async () => {
    charge("ch-1", "2030-01");
    buchen("seed-1", "ch-1", 5);

    for (const menge of [0, -3]) {
      const erg = await bucheInEntnahmebox(
        { fahrzeugId: "fz-1", artikelId: "art-1", menge },
        t.db,
      );
      expect(erg.ok, `Menge ${menge}`).toBe(false);
      expect(erg.ok === false && erg.grund).toBe("eingabe");
    }
    expect(neueZeilen()).toHaveLength(0);
  });
});

describe("bucheInEntnahmebox — die Box als Lagerort", () => {
  it("legt die Migration NEBEN dem Handlager an, nicht darunter", () => {
    /*
     * ⚠️ DIE TRAGENDE EIGENSCHAFT DES GANZEN TICKETS, und sie ist eine Zeile in
     * `lagerorte`. Haengt die Box unter dem Handlager, zaehlt ihr Inhalt ueber
     * `handlagerOrte()` sofort als Handlagerbestand — im Bestellvorschlag, in
     * der Verfallsliste, in der FEFO-Verteilung jeder Entnahme am Regal.
     * `typecheck`, `lint` und `build` saehen davon nichts.
     */
    const box = t.db.select().from(lagerorte)
      .where(eq(lagerorte.id, ENTNAHMEBOX_ID)).get()!;
    expect(box.parentId).toBeNull();
    expect(box.typ).toBe("lager");
    // Und sie ist KEIN Traeger: keine Art, kein Soll, kein Check.
    expect(box.einheitenart).toBeNull();
    expect(box.aktiv).toBe(true);
  });

  it("frischt die beiden Flaechen und das Einheitenblatt auf", async () => {
    charge("ch-1", "2030-01");
    buchen("seed-1", "ch-1", 5);

    await bucheInEntnahmebox({ fahrzeugId: "fz-1", artikelId: "art-1", menge: 1 }, t.db);

    expect(revalidiert).toContain("/m/lagerbuch/verwaltung/entnahmebox");
    expect(revalidiert).toContain("/m/lagerbuch/helfer/box");
    // MIT der Id: der Pfad des Einheitenblatts traegt sie, ein Pfad ohne sie
    // traefe die Seite nicht.
    expect(revalidiert).toContain("/m/lagerbuch/verwaltung/fahrzeuge/fz-1");
  });

  /*
   * ── DIE GEMELDETE ANGABE WANDERT MIT (DRK-377) ──────────────────────────
   *
   * ⚠️ DIESE VIER FAELLE STANDEN EINMAL ANDERSHERUM DA, und der Weg dahin
   * gehoert zur Aussage (Codex-Review zu PR #175, drei Runden, dann DRK-377):
   *
   * 1. Ohne Loeschen meldet die geleerte Einheit den Artikel weiter als
   *    ablaufend — `verfallFuerLagerort` liest ohne Bestandsprobe.
   * 2. Mit Loeschen ging das gemeldete Datum verloren, wo es die EINZIGE Stelle
   *    war: `postenAmOrt` las den Verfall nur aus `chargen.verfall`, und die
   *    Kiste zeigt die Charge, nicht die Meldung.
   * 3. Loeschen nur bei „echtem Datum an der bewegten Charge" half nicht:
   *    `korrekturAufLagerort` waehlt beim Plus-Abgleich IRGENDEINE Charge des
   *    Artikels, absteigend nach Verfall — das Datum kann geraten sein.
   *
   * Alle drei scheiterten daran, dass die Box einen gemeldeten Verfall gar
   * nicht FUEHREN konnte. DRK-377 hat die Bindung ans Soll von der Tabelle
   * genommen, und seither gibt es den dritten Ausgang: die Angabe wandert.
   */
  it("traegt den gemeldeten Verfall IN DIE BOX und raeumt ihn an der leeren Einheit ab", async () => {
    charge("ch-1", "2030-01");
    buchen("seed-1", "ch-1", 5);
    setzeVerfall(t.db, {
      lagerortId: "fz-1", artikelId: "art-1", verfall: "2027-03",
      quelle: { quelleTyp: "system", quelleId: "seed" },
    });

    await bucheInEntnahmebox({ fahrzeugId: "fz-1", artikelId: "art-1", menge: 5 }, t.db);

    expect(verfallZeilen().map((z) => z.verfall), "die geleerte Einheit").toEqual([]);
    expect(verfallZeilen(ENTNAHMEBOX_ID).map((z) => z.verfall), "die Box").toEqual(["2027-03"]);
  });

  it("rettet das Datum, wenn der Bestand auf einer PSEUDO-Charge liegt", async () => {
    /*
     * ⚠️ DER FALL, DER DAS TICKET AUSGELOEST HAT. Ein Check, der Bestand keiner
     * echten Charge zuordnen kann, legt ihn auf eine Pseudo-Charge
     * (`PSEUDO_VERFALL`) und schreibt den wirklich gemeldeten Verfall in
     * `lagerort_verfall`. Wandert dieser Bestand in die Box, wandert die
     * Pseudo-Charge mit — und `postenAmOrt` las den Verfall bis DRK-377
     * AUSSCHLIESSLICH aus `chargen.verfall`. Die Kiste zeigte „bis 12/99",
     * obwohl fuer dieses Material 10/26 gemeldet war.
     *
     * ⚠️ DAS IST DER REGRESSIONSTEST DES TICKETS: ohne die Uebernahme steht die
     * 10/26 nach dieser Buchung nirgends mehr — weder an der Einheit noch in
     * der Box —, und die Zusicherung auf die Box ist rot.
     */
    charge("ch-pseudo", PSEUDO_VERFALL);
    buchen("seed-1", "ch-pseudo", 5);
    setzeVerfall(t.db, {
      lagerortId: "fz-1", artikelId: "art-1", verfall: "2026-10",
      quelle: { quelleTyp: "system", quelleId: "check" },
    });

    // ALLES raus — die Einheit ist danach leer.
    await bucheInEntnahmebox({ fahrzeugId: "fz-1", artikelId: "art-1", menge: 5 }, t.db);

    expect(verfallZeilen(ENTNAHMEBOX_ID).map((z) => z.verfall), "die Kiste kennt 10/26")
      .toEqual(["2026-10"]);
    expect(verfallZeilen().map((z) => z.verfall), "die leere Einheit nicht mehr")
      .toEqual([]);
  });

  it("uebernimmt Meldezeitpunkt und Quelle unveraendert — sie stammen aus dem Check", async () => {
    /*
     * ⚠️ EINE MELDUNG IST EINE MESSUNG, KEINE BUCHUNG. Stempelte die Uebernahme
     * „jetzt" und den Umbuchenden darauf, stuende in der Verfallsuebersicht
     * unter „Gemeldet" der heutige Tag — eine Ablesung, die nie stattgefunden
     * hat. Genau diese Klasse von Fehler hat DRK-377 an seinem Weg 3
     * ausdruecklich verworfen („schreibt Geschichte, die so nie gemessen
     * wurde"); sie hier durch die Hintertuer einzubauen waere derselbe Fehler
     * eine Ebene tiefer.
     */
    const gemeldetAm = new Date("2026-06-01T09:30:00Z");
    charge("ch-pseudo", PSEUDO_VERFALL);
    buchen("seed-1", "ch-pseudo", 3);
    setzeVerfall(t.db, {
      lagerortId: "fz-1", artikelId: "art-1", verfall: "2026-10",
      quelle: { quelleTyp: "oidc", quelleId: "u-pruefer" }, jetzt: gemeldetAm,
    });

    await bucheInEntnahmebox({ fahrzeugId: "fz-1", artikelId: "art-1", menge: 3 }, t.db);

    const inDerBox = verfallZeilen(ENTNAHMEBOX_ID);
    expect(inDerBox).toHaveLength(1);
    expect(inDerBox[0].erfasstAt).toEqual(gemeldetAm);
    expect(inDerBox[0].quelleTyp).toBe("oidc");
    expect(inDerBox[0].quelleId).toBe("u-pruefer");
  });

  it("behaelt bei zwei Herkuenften das FRUEHERE Datum", async () => {
    /*
     * ⚠️ BETREIBERENTSCHEIDUNG ZU DRK-377. Die Box traegt je Artikel genau
     * EINEN Wert (Unique-Index Ort/Artikel), und die Tabelle bedeutet „das
     * frueheste Datum, das an diesem Ort auf einer Packung steht". Zwei
     * Einheiten, die denselben Artikel in dieselbe Kiste geben, ergeben also
     * keine zwei Zeilen — die sichere Richtung ist, eher zu frueh zu warnen als
     * zu spaet.
     *
     * Die zweite Abgabe traegt hier das SPAETERE Datum und kommt als ZWEITE:
     * ein naiver Upsert (wie ihn `setzeVerfall` macht) ueberschriebe damit die
     * 10/26 mit 11/28, und die Kiste verspraeche fuenfzehn Monate, die sie
     * nicht hat.
     */
    charge("ch-a", PSEUDO_VERFALL);
    buchen("seed-1", "ch-a", 2, "fz-1");
    setzeVerfall(t.db, {
      lagerortId: "fz-1", artikelId: "art-1", verfall: "2026-10",
      quelle: { quelleTyp: "system", quelleId: "check" },
    });
    charge("ch-b", PSEUDO_VERFALL);
    buchen("seed-2", "ch-b", 2, "ta-1");
    setzeVerfall(t.db, {
      lagerortId: "ta-1", artikelId: "art-1", verfall: "2028-11",
      quelle: { quelleTyp: "system", quelleId: "check" },
    });

    await bucheInEntnahmebox({ fahrzeugId: "fz-1", artikelId: "art-1", menge: 2 }, t.db);
    await bucheInEntnahmebox({ fahrzeugId: "ta-1", artikelId: "art-1", menge: 2 }, t.db);

    expect(verfallZeilen(ENTNAHMEBOX_ID).map((z) => z.verfall)).toEqual(["2026-10"]);
  });

  it("laesst die Angabe an der Einheit stehen, solange noch etwas dort liegt", async () => {
    // ⚠️ DIE GEGENPROBE, und sie ist der teurere Fehler: eine zu frueh
    // geloeschte Angabe nimmt eine gepflegte Information weg, ohne dass es
    // jemand merkt. Geloescht wird erst beim LETZTEN Stueck — dass die Angabe
    // jetzt AUCH in der Box steht, macht sie an der Einheit nicht falsch.
    charge("ch-1", "2030-01");
    buchen("seed-1", "ch-1", 5);
    setzeVerfall(t.db, {
      lagerortId: "fz-1", artikelId: "art-1", verfall: "2027-03",
      quelle: { quelleTyp: "system", quelleId: "seed" },
    });

    await bucheInEntnahmebox({ fahrzeugId: "fz-1", artikelId: "art-1", menge: 4 }, t.db);

    expect(verfallZeilen().map((z) => z.verfall)).toEqual(["2027-03"]);
    expect(verfallZeilen(ENTNAHMEBOX_ID).map((z) => z.verfall)).toEqual(["2027-03"]);
  });

  it("legt ohne Meldung an der Einheit auch in der Box keine an", async () => {
    // Eine leere Zeile waere eine Behauptung ueber ein Datum, das niemand
    // gelesen hat — und `lagerortVerfallListe` fuehrte die Box dann mit einem
    // Wert, den kein Mensch gemeldet hat.
    charge("ch-1", "2030-01");
    buchen("seed-1", "ch-1", 5);

    await bucheInEntnahmebox({ fahrzeugId: "fz-1", artikelId: "art-1", menge: 5 }, t.db);

    expect(verfallZeilen(ENTNAHMEBOX_ID)).toEqual([]);
  });

});
