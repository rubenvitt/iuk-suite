import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import { artikel, buchungen, chargen, lagerorte, lagerortVerfall } from "../_db/schema";
import {
  ENTNAHMEBOX_EINRAEUMEN_KOMMENTAR, ENTNAHMEBOX_ID, ENTNAHMEBOX_KOMMENTAR, PSEUDO_VERFALL,
} from "../_lib/konstanten";
import { EINRAEUMEN_PRAEFIX, ENTNAHMEBOX_PRAEFIX } from "../_lib/vorgang";
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

const { helferRiegel, adminRiegel, revalidiert, sitzung } = vi.hoisted(() => ({
  helferRiegel: vi.fn<() => Promise<unknown>>(),
  /**
   * DER RIEGEL DES RUECKWEGS — DRK-381, und er ist ABSICHTLICH ein anderer als
   * `helferRiegel`. In die Kiste legt die Helferin am Fahrzeug
   * (`requireHelferSchreibend`, traegt Kaertchen UND Konto), eingeraeumt wird
   * vom Gruppenfuehrer (`requireLagerbuchAdmin`, also nur Konto). Zwei
   * Attrappen halten das auseinander: eine gemeinsame liesse nicht mehr
   * pruefen, dass ein Kaertchen den Rueckweg auf keinem Weg erreicht.
   */
  adminRiegel: vi.fn<() => Promise<unknown>>(),
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

vi.mock("../_lib/zugang", () => ({
  requireLagerbuchAdmin: () => adminRiegel(),
}));

vi.mock("../_db/client", () => ({
  getDb: () => { throw new Error("getDb() im Test — jeder Aufruf uebergibt t.db"); },
}));

import { BESTANDSFLAECHEN } from "../_lib/revalidierung";
import { bucheInEntnahmebox, raeumeAusEntnahmebox } from "./entnahmebox";

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

/** Der angemeldete Viewer, wie ihn `requireLagerbuchAdmin` zurueckgibt. */
const VIEWER = { sub: "u-admin", groups: ["lagerbuch"], name: "A. Verwaltung", email: null };

let t: TestDb;

beforeEach(() => {
  revalidiert.length = 0;
  helferRiegel.mockResolvedValue(KAERTCHEN);
  adminRiegel.mockResolvedValue(VIEWER);
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
    /*
     * ⚠️ DAS EINHEITENBLATT ALS MUSTER, NICHT MIT DER ID — und die Korrektur
     * kam aus der Codex-Review zu PR #187. Hier stand `…/fahrzeuge/fz-1`, weil
     * nur DIESE Einheit Ware bekommen hat. Jede Fahrzeugseite zeigt aber ueber
     * `sollFuerFahrzeug` auch den HANDLAGER-Bestand je Position, und der ist
     * gerade gesunken — betroffen sind also alle, nicht nur `fz-1`.
     */
    expect(revalidiert).toContain("/m/lagerbuch/verwaltung/fahrzeuge/[id]");
    // DIE EINRAEUMSEITE liest ueber `einraeumPosten` denselben Boxinhalt —
    // samt der gemeldeten Verfallsangabe, die seit DRK-377 an ihm haengt.
    expect(revalidiert).toContain("/m/lagerbuch/auffuellen/box");
  });

  it("frischt auch die Verfallsuebersicht und die Einheitenliste auf", async () => {
    /*
     * ⚠️ SEIT DRK-377 SCHREIBT DIESE ACTION `lagerort_verfall` — sie traegt die
     * Meldung in die Box und raeumt sie an der leeren Einheit ab. Damit liest
     * sie dieselbe Tabelle wie `verfallSetzen`, der Check,
     * `aussondernVomLagerort` und `fahrzeuge.ts`, und alle vier frischen genau
     * diese beiden Pfade mit auf (Codex zu PR #194, P2).
     *
     * ⚠️ `force-dynamic` AUF DER SEITE HILFT NICHT: es schaltet den vollen
     * Routen-Cache ab, nicht den Router-Cache im Browser. Eine vorgeladene
     * Verfallsuebersicht zeigte sonst die geleerte Einheit weiter als ablaufend
     * und die Box gar nicht — und kein Tor sieht das, weil beide Seiten fuer
     * sich richtig rechnen.
     */
    charge("ch-1", "2030-01");
    buchen("seed-1", "ch-1", 5);
    setzeVerfall(t.db, {
      lagerortId: "fz-1", artikelId: "art-1", verfall: "2027-03",
      quelle: { quelleTyp: "system", quelleId: "seed" },
    });

    await bucheInEntnahmebox({ fahrzeugId: "fz-1", artikelId: "art-1", menge: 5 }, t.db);

    expect(revalidiert).toContain("/m/lagerbuch/verwaltung/verfall");
    // OHNE Id: die Einheitenliste zaehlt die Meldungen JE Einheit
    // (`fahrzeugUebersicht`), und diese Zahl hat sich gerade geaendert.
    expect(revalidiert).toContain("/m/lagerbuch/verwaltung/fahrzeuge");
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

/* ──────────────────────────────────────────────────────────────────────────
 * DER WEG ZURUECK — DRK-381.
 *
 * ⚠️ DIE ZUSAGE, DIE HIER HAENGT, IST DIE DES TICKETKOPFS: „das ist eine
 * UMLAGERUNG, kein Wareneingang." Sie ist eine Aussage ueber ZWEI Zeilen mit
 * DERSELBEN Referenz, DERSELBEN Charge und der Summe null — also genau das,
 * was ein Mock der Schreibpfade behaupten statt messen wuerde. Deshalb laeuft
 * auch dieser Block gegen eine echte, migrierte SQLite.
 * ────────────────────────────────────────────────────────────────────────── */

/** Ein Schrank unter dem Handlager — das uebliche Ziel des Einraeumens. */
function schrank(id: string, name: string, aktiv = true) {
  t.db.insert(lagerorte).values({
    id, name, typ: "lager", parentId: "handlager", aktiv, sortierung: 0,
  }).run();
}

/** Was in der Box liegt — `buchen()` schreibt sonst aufs Fahrzeug. */
function inDerBox(id: string, chargeId: string, menge: number, artikelId = "art-1") {
  buchen(id, chargeId, menge, ENTNAHMEBOX_ID, artikelId);
}

describe("raeumeAusEntnahmebox — die gemeldete Verfallsangabe der Box (DRK-377)", () => {
  /*
   * ⚠️ DIESE VIER FAELLE SIND BEIM MERGE VON DRK-377 UND DRK-381 ENTSTANDEN,
   * und vorher konnte es sie gar nicht geben: bis DRK-377 trug die Box keinen
   * gemeldeten Verfall, und bis DRK-381 gab es keinen Weg aus ihr heraus. Erst
   * zusammen ergeben sie den Fall — und ohne das Abraeumen bliebe die Zeile
   * FUER IMMER stehen, weil die Box keinen Verfall-Editor hat. Sie meldete
   * dauerhaft einen Verfall fuer Material, das laengst im Schrank liegt.
   */
  /*
   * ⚠️ DIE CHARGE TRAEGT HIER DAS GEMELDETE DATUM. Das ist der einzige Fall, in
   * dem das Material seinen Verfall wirklich mitnimmt — und damit der einzige,
   * in dem die Meldung fallen darf. Die Faelle, in denen sie es NICHT tut,
   * stehen einzeln darunter.
   */
  beforeEach(() => {
    schrank("sch-1", "Schrank 1");
    charge("ch-1", "2026-10");
    inDerBox("seed-1", "ch-1", 10);
    setzeVerfall(t.db, {
      lagerortId: ENTNAHMEBOX_ID, artikelId: "art-1", verfall: "2026-10",
      quelle: { quelleTyp: "system", quelleId: "check" },
    });
  });

  it("raeumt die Angabe ab, wenn die Kiste dabei leer wird", async () => {
    await raeumeAusEntnahmebox(
      { artikelId: "art-1", chargeId: "ch-1", menge: 10, zielLagerortId: "sch-1" },
      t.db,
    );

    expect(verfallZeilen(ENTNAHMEBOX_ID)).toEqual([]);
  });

  it("laesst sie stehen, solange noch etwas in der Kiste liegt", async () => {
    await raeumeAusEntnahmebox(
      { artikelId: "art-1", chargeId: "ch-1", menge: 4, zielLagerortId: "sch-1" },
      t.db,
    );

    expect(verfallZeilen(ENTNAHMEBOX_ID).map((z) => z.verfall)).toEqual(["2026-10"]);
  });

  it("BEHAELT sie, wenn die Charge ein ECHTES, aber ANDERES Datum traegt", async () => {
    /*
     * ⚠️ DER FALL, DEN „hat die Charge ueberhaupt ein Datum?" DURCHGELASSEN
     * HAETTE (Codex zu PR #194, zweiter P1). `korrekturAufLagerort` waehlt beim
     * Plus-Abgleich IRGENDEINE Charge des Artikels — ohne Ortsfilter,
     * absteigend nach `verfall`. Die kann 12/30 sagen, waehrend der Check 10/26
     * gemeldet hat. Ein echtes Datum an der Charge beweist also nichts ueber
     * DIESES Material, und wer die Meldung darauf hin loescht, laesst das
     * Handlager bis 12/30 unbedenklich aussehen.
     *
     * Die Begruendung steht seit jeher im Modul — an Fassung 3 der
     * Gegenrichtung. Mein erster Riegel stuetzte sich trotzdem auf genau die
     * Eigenschaft, die sie als wertlos bezeichnet.
     */
    charge("ch-geraten", "2030-12", "art-2");
    inDerBox("seed-2", "ch-geraten", 5, "art-2");
    setzeVerfall(t.db, {
      lagerortId: ENTNAHMEBOX_ID, artikelId: "art-2", verfall: "2026-10",
      quelle: { quelleTyp: "system", quelleId: "check" },
    });

    await raeumeAusEntnahmebox(
      { artikelId: "art-2", chargeId: "ch-geraten", menge: 5, zielLagerortId: "sch-1" },
      t.db,
    );

    const fuerArt2 = verfallZeilen(ENTNAHMEBOX_ID).filter((z) => z.artikelId === "art-2");
    expect(fuerArt2.map((z) => z.verfall), "10/26 bleibt erhalten").toEqual(["2026-10"]);
  });

  it("BEHAELT sie, wenn die bewegte Charge gar kein Datum traegt", async () => {
    /*
     * ⚠️ DER GEFAEHRLICHSTE FALL DES GANZEN TICKETS, und mein erster Entwurf
     * hatte ihn falsch (Codex zu PR #194, P1). Meine Begruendung lautete „im
     * Handlager traegt den Verfall die Charge" — das stimmt nur, solange die
     * Charge ueberhaupt eines traegt. Kann ein Check den gezaehlten Bestand
     * keiner echten Charge zuordnen, legt er ihn auf eine Pseudo-Charge mit
     * `PSEUDO_VERFALL`; die sagt „bis 12/99", also gar nichts, und das einzige
     * echte Datum steht in `lagerort_verfall`.
     *
     * Wer es hier loescht, macht aus einer stillen Falschanzeige einen stillen
     * DATENVERLUST — und zwar am gefaehrlichsten Ort: im Handlager sieht das
     * Material danach bis 2099 unbedenklich aus.
     */
    /*
     * ⚠️ EIN EIGENER ARTIKEL, DAMIT DIE KISTE WIRKLICH LEER WIRD. Die
     * gemeinsame Vorbereitung legt zehn Stueck einer ECHT datierten Charge in
     * die Box; blieben die liegen, raeumte die Regel ohnehin nichts ab und der
     * Test waere auch ohne den Riegel gruen — er prueefte dann nichts.
     */
    charge("ch-pseudo", PSEUDO_VERFALL, "art-2");
    inDerBox("seed-2", "ch-pseudo", 5, "art-2");
    setzeVerfall(t.db, {
      lagerortId: ENTNAHMEBOX_ID, artikelId: "art-2", verfall: "2026-10",
      quelle: { quelleTyp: "system", quelleId: "check" },
    });

    await raeumeAusEntnahmebox(
      { artikelId: "art-2", chargeId: "ch-pseudo", menge: 5, zielLagerortId: "sch-1" },
      t.db,
    );

    const fuerArt2 = verfallZeilen(ENTNAHMEBOX_ID).filter((z) => z.artikelId === "art-2");
    expect(fuerArt2.map((z) => z.verfall), "10/26 bleibt erhalten").toEqual(["2026-10"]);
  });

  it("traegt sie NICHT ins Handlager — dort meldet die Charge", async () => {
    /*
     * ⚠️ DIE FACHLICHE AUSSAGE DIESES TESTS. Im Handlager rechnet
     * `verfallListe` den Verfall je CHARGE, und die Charge wandert bei dieser
     * Buchung ohnehin mit. Eine `lagerort_verfall`-Zeile am Schrank waere ein
     * zweiter, widersprechender Melder fuer dieselbe Packung — und stuende in
     * der Verfallsuebersicht neben ihr.
     */
    await raeumeAusEntnahmebox(
      { artikelId: "art-1", chargeId: "ch-1", menge: 10, zielLagerortId: "sch-1" },
      t.db,
    );

    expect(verfallZeilen("sch-1")).toEqual([]);
  });

});

describe("raeumeAusEntnahmebox — die Umbuchung", () => {
  it("bildet Abgang und Zugang als EIN Vorgang ab: zwei Legs, eine Referenz, eine Charge", async () => {
    schrank("sch-1", "Schrank 1");
    charge("ch-1", "2030-01");
    inDerBox("seed-1", "ch-1", 10);

    const erg = await raeumeAusEntnahmebox(
      { artikelId: "art-1", chargeId: "ch-1", menge: 4, zielLagerortId: "sch-1" },
      t.db,
    );

    expect(erg).toEqual({ ok: true, wert: { eingeraeumt: 4, ziel: "Schrank 1" } });

    const zeilen = neueZeilen();
    expect(zeilen).toHaveLength(2);

    // ⚠️ NETTO NULL ueber beide Orte — Akzeptanzkriterium 2. Waere sie
    // verletzt, entstuende Bestand aus dem Nichts: genau der Fehler, den der
    // Zugangspfad („auffuellen") hier gemacht haette.
    expect(zeilen.reduce((s, b) => s + b.menge, 0)).toBe(0);

    const ab = zeilen.find((b) => b.lagerortId === ENTNAHMEBOX_ID)!;
    const zu = zeilen.find((b) => b.lagerortId === "sch-1")!;
    expect(ab.menge).toBe(-4);
    expect(zu.menge).toBe(4);

    /*
     * ⚠️ BEIDE LEGS TRAGEN `umlagerung`, NICHT `zugang` — das ist die Falle des
     * Tickets in einer Zusicherung. Ein `zugang` liesse den
     * Wareneingangsbericht und den Bestellvorschlag eine Lieferung lesen, wo
     * nur etwas umgeraeumt wurde, und die Bestellt-Markierung fiele still weg.
     */
    expect(ab.typ).toBe("umlagerung");
    expect(zu.typ).toBe("umlagerung");

    // DIE KLAMMER: dieselbe Referenz, und sie nennt das ZIEL.
    expect(ab.referenz).toBe(`${EINRAEUMEN_PRAEFIX}sch-1`);
    expect(zu.referenz).toBe(ab.referenz);

    // AK3 — DIE CHARGE WANDERT MIT, und damit die Verfallsangabe.
    expect(ab.chargeId).toBe("ch-1");
    expect(zu.chargeId).toBe("ch-1");

    expect(zu.kommentar).toBe(ENTNAHMEBOX_EINRAEUMEN_KOMMENTAR);

    expect(bestand(ENTNAHMEBOX_ID, "ch-1")).toBe(6);
    expect(bestand("sch-1", "ch-1")).toBe(4);
  });

  it("raeumt GENAU DIE gewaehlte Charge ein — auch wenn eine aeltere daneben liegt", async () => {
    /*
     * ⚠️ DER FALL, DEN FEFO FALSCH MACHEN WUERDE, und beim Einraeumen gibt es
     * dafuer nicht einmal einen Rueckfall: die Kiste liegt offen vor einem, die
     * Ampel der Charge entscheidet, ob das Teil ueberhaupt zurueck in den
     * Schrank geht. Der Fehler waere STILL — netto bleibt null, der
     * Handlager-Bestand stimmt, nur die Ortsangabe je Charge ist falsch.
     */
    schrank("sch-1", "Schrank 1");
    charge("ch-alt", "2027-01");
    charge("ch-neu", "2030-01");
    inDerBox("seed-alt", "ch-alt", 5);
    inDerBox("seed-neu", "ch-neu", 5);

    await raeumeAusEntnahmebox(
      { artikelId: "art-1", chargeId: "ch-neu", menge: 2, zielLagerortId: "sch-1" },
      t.db,
    );

    expect(bestand("sch-1", "ch-neu")).toBe(2);
    expect(bestand("sch-1", "ch-alt")).toBe(0);
    expect(bestand(ENTNAHMEBOX_ID, "ch-alt")).toBe(5);
  });

  it("erlaubt TEILMENGEN — derselbe Posten auf zwei Schraenke", async () => {
    // Die zweite offene Frage des Tickets, als Zusicherung: eine Charge auf
    // zwei Schraenke zu verteilen ist der Normalfall. „Ganz oder gar nicht"
    // zwaenge zu zwei Vorgaengen fuer einen Handgriff.
    schrank("sch-1", "Schrank 1");
    schrank("sch-2", "Schrank 2");
    charge("ch-1", "2030-01");
    inDerBox("seed-1", "ch-1", 5);

    await raeumeAusEntnahmebox(
      { artikelId: "art-1", chargeId: "ch-1", menge: 3, zielLagerortId: "sch-1" },
      t.db,
    );
    await raeumeAusEntnahmebox(
      { artikelId: "art-1", chargeId: "ch-1", menge: 2, zielLagerortId: "sch-2" },
      t.db,
    );

    expect(bestand("sch-1", "ch-1")).toBe(3);
    expect(bestand("sch-2", "ch-1")).toBe(2);
    expect(bestand(ENTNAHMEBOX_ID, "ch-1")).toBe(0);
  });

  it("nimmt die Handlager-WURZEL als Ziel — „Schrank noch nicht zugeordnet“", async () => {
    // Die Wurzel ist eine ZEILE der Auswahl, kein Sonderfall: sie heisst
    // „ich weiss den Schrank noch nicht" (`ZUGANGSZIEL_WURZEL_LABEL`).
    charge("ch-1", "2030-01");
    inDerBox("seed-1", "ch-1", 2);

    const erg = await raeumeAusEntnahmebox(
      { artikelId: "art-1", chargeId: "ch-1", menge: 2, zielLagerortId: "handlager" },
      t.db,
    );

    expect(erg.ok).toBe(true);
    expect(bestand("handlager", "ch-1")).toBe(2);
    expect(bestand(ENTNAHMEBOX_ID, "ch-1")).toBe(0);
  });

  it("raeumt auch aus einer STILLGELEGTEN Box — sonst strandet, was darin liegt", async () => {
    /*
     * ⚠️ DIE GEGENRICHTUNG VERLANGT `aktiv`, DIESE NICHT, und das ist kein
     * Widerspruch: eine stillgelegte Kiste nimmt nichts mehr AUF. Sie
     * auszuraeumen muss gerade dann gehen — alles andere liesse ihren Inhalt
     * fuer immer an einem Ort liegen, den weder Verfallsliste noch Inventur
     * sehen.
     */
    t.db.update(lagerorte).set({ aktiv: false })
      .where(eq(lagerorte.id, ENTNAHMEBOX_ID)).run();
    schrank("sch-1", "Schrank 1");
    charge("ch-1", "2030-01");
    inDerBox("seed-1", "ch-1", 3);

    const erg = await raeumeAusEntnahmebox(
      { artikelId: "art-1", chargeId: "ch-1", menge: 3, zielLagerortId: "sch-1" },
      t.db,
    );

    expect(erg.ok).toBe(true);
    expect(bestand("sch-1", "ch-1")).toBe(3);
  });

  it("raeumt einen STILLGELEGTEN Artikel ein — die dritte offene Frage des Tickets", async () => {
    /*
     * ⚠️ ERLAUBT, NICHT VERBOTEN, und die Begruendung ist die Abwesenheit eines
     * anderen Weges: es gibt heute keinen Schreibpfad, der aus der Kiste
     * AUSSONDERT (`aussondernVomLagerort` haengt an der Einheitenseite). Ein
     * Verbot liesse das Material dauerhaft in der Box — an einem Ort, den weder
     * Verfallsliste noch Inventur sehen. Im Schrank sieht `verfallListe` es
     * wieder; sie filtert `artikel.aktiv` ausdruecklich NICHT.
     *
     * Die Oberflaeche verschweigt es trotzdem nicht: `BoxEinraeumen` setzt den
     * Chip „stillgelegt" an die Zeile.
     */
    schrank("sch-1", "Schrank 1");
    t.db.update(artikel).set({ aktiv: false }).where(eq(artikel.id, "art-1")).run();
    charge("ch-1", "2030-01");
    inDerBox("seed-1", "ch-1", 2);

    const erg = await raeumeAusEntnahmebox(
      { artikelId: "art-1", chargeId: "ch-1", menge: 2, zielLagerortId: "sch-1" },
      t.db,
    );

    expect(erg.ok).toBe(true);
    expect(bestand("sch-1", "ch-1")).toBe(2);
  });

  it("schreibt die Buchung auf den angemeldeten `sub`, nie auf ein Kaertchen", async () => {
    // ⚠️ AUCH DANN NICHT, WENN EIN GUELTIGES KAERTCHEN DANEBEN LIEGT: dieser
    // Weg liest `requireHelferSchreibend` gar nicht. Ein Kaertchen erreicht ihn
    // auf keinem Weg — das ist die Zusage des Riegels, nicht der Flaeche.
    schrank("sch-1", "Schrank 1");
    charge("ch-1", "2030-01");
    inDerBox("seed-1", "ch-1", 2);

    await raeumeAusEntnahmebox(
      { artikelId: "art-1", chargeId: "ch-1", menge: 1, zielLagerortId: "sch-1" },
      t.db,
    );

    for (const b of neueZeilen()) {
      expect(b.quelleTyp).toBe("oidc");
      expect(b.quelleId).toBe("u-admin");
    }
  });

  it("raeumt die Flaechen aus, die danach veraltet sind", async () => {
    schrank("sch-1", "Schrank 1");
    charge("ch-1", "2030-01");
    inDerBox("seed-1", "ch-1", 2);

    await raeumeAusEntnahmebox(
      { artikelId: "art-1", chargeId: "ch-1", menge: 1, zielLagerortId: "sch-1" },
      t.db,
    );

    /*
     * ⚠️ HIER STANDEN BIS ZUM MERGE VON DRK-374 ZEHN AUSGESCHRIEBENE PFADE:
     * die geteilte Acht aus DRK-381, plus die beiden Box-Flaechen einzeln, und
     * `helfer/box` fehlte ausdruecklich („zeigt den Bestand EINER EINHEIT").
     *
     * DRK-374 entscheidet diese Abwaegung anders: die Liste ist pauschal, sie
     * nennt JEDE Flaeche, die Artikelbestand oder Buchungszeilen zeigt, und
     * jeder Bestandsschreiber nimmt sie ganz. Ein Pfad zu viel kostet einen
     * Rerender, ein Pfad zu wenig eine falsche Zahl, die niemand meldet. Der
     * Sollwert steht woertlich in `_lib/revalidierung.test.ts`; hier zaehlt
     * nur, DASS dieser Schreiber sie nimmt und nichts daneben.
     */
    expect(revalidiert).toEqual([...BESTANDSFLAECHEN]);
  });
});

describe("raeumeAusEntnahmebox — was sie ablehnt", () => {
  it("bucht NICHTS, wenn die Menge nicht gedeckt ist — statt still zu kappen", async () => {
    // AK4. Derselbe Unterschied zur Entnahme wie in der Gegenrichtung: eine
    // gekappte Umlagerung liesse den Buchstand an BEIDEN Orten falsch stehen.
    schrank("sch-1", "Schrank 1");
    charge("ch-1", "2030-01");
    inDerBox("seed-1", "ch-1", 3);

    const erg = await raeumeAusEntnahmebox(
      { artikelId: "art-1", chargeId: "ch-1", menge: 5, zielLagerortId: "sch-1" },
      t.db,
    );

    expect(erg.ok).toBe(false);
    // Die Zahl UND die Einheit des Artikels — kein erfundenes „Stück".
    expect(erg.ok === false && erg.text).toContain("nur 3 Stk");
    expect(neueZeilen()).toHaveLength(0);
    expect(bestand(ENTNAHMEBOX_ID, "ch-1")).toBe(3);
  });

  it("zaehlt NUR den Bestand IN DER BOX, nicht den am Fahrzeug", async () => {
    // ⚠️ DIE DECKUNG IST ORTSGEBUNDEN. Ohne den Ortsfilter deckte Bestand, der
    // noch auf dem Fahrzeug liegt, eine Buchung aus der Kiste — und die Box
    // stuende danach im Minus.
    schrank("sch-1", "Schrank 1");
    charge("ch-1", "2030-01");
    buchen("seed-fz", "ch-1", 10, "fz-1");
    inDerBox("seed-box", "ch-1", 1);

    const erg = await raeumeAusEntnahmebox(
      { artikelId: "art-1", chargeId: "ch-1", menge: 4, zielLagerortId: "sch-1" },
      t.db,
    );

    expect(erg.ok).toBe(false);
    expect(neueZeilen()).toHaveLength(0);
    expect(bestand("fz-1", "ch-1")).toBe(10);
  });

  it("lehnt eine Charge ab, die einem anderen Artikel gehoert (I5)", async () => {
    schrank("sch-1", "Schrank 1");
    charge("ch-fremd", "2030-01", "art-2");
    inDerBox("seed-fremd", "ch-fremd", 9, "art-2");

    const erg = await raeumeAusEntnahmebox(
      { artikelId: "art-1", chargeId: "ch-fremd", menge: 1, zielLagerortId: "sch-1" },
      t.db,
    );

    expect(erg.ok).toBe(false);
    expect(erg.ok === false && erg.text).toContain("gehört nicht zu diesem Artikel");
    expect(neueZeilen()).toHaveLength(0);
  });

  it("lehnt einen STILLGELEGTEN Schrank als Ziel ab", async () => {
    /*
     * ⚠️ DIE QUELLE DARF STILLGELEGT SEIN, DAS ZIEL NICHT — dieselbe
     * Festlegung wie in `bucheUmlagerung`: genau deshalb legt man einen Schrank
     * still, um ihn auszuraeumen. Material hineinzuraeumen waere der
     * Gegenhandgriff.
     */
    schrank("sch-tot", "Alter Schrank", false);
    charge("ch-1", "2030-01");
    inDerBox("seed-1", "ch-1", 5);

    const erg = await raeumeAusEntnahmebox(
      { artikelId: "art-1", chargeId: "ch-1", menge: 1, zielLagerortId: "sch-tot" },
      t.db,
    );

    expect(erg.ok).toBe(false);
    expect(erg.ok === false && erg.text).toContain("stillgelegt");
    expect(neueZeilen()).toHaveLength(0);
  });

  it("lehnt ein FAHRZEUG als Ziel ab — der Weg dorthin ist die Entnahme", async () => {
    /*
     * ⚠️ OHNE DIESE PROBE ENTSCHIEDE DER FREMDSCHLUESSEL, und der laesst jeden
     * Lagerort durch: 'fz-1' ist eine gueltige `lagerorte.id`. Eine selbst
     * gebaute Anfrage bestueckte damit ein Fahrzeug aus der Kiste, ohne dass
     * eine Entnahme im Journal stuende.
     */
    charge("ch-1", "2030-01");
    inDerBox("seed-1", "ch-1", 5);

    const erg = await raeumeAusEntnahmebox(
      { artikelId: "art-1", chargeId: "ch-1", menge: 1, zielLagerortId: "fz-1" },
      t.db,
    );

    expect(erg.ok).toBe(false);
    expect(neueZeilen()).toHaveLength(0);
  });

  it("lehnt die Box selbst als Ziel ab", async () => {
    charge("ch-1", "2030-01");
    inDerBox("seed-1", "ch-1", 5);

    const erg = await raeumeAusEntnahmebox(
      { artikelId: "art-1", chargeId: "ch-1", menge: 1, zielLagerortId: ENTNAHMEBOX_ID },
      t.db,
    );

    expect(erg.ok).toBe(false);
    expect(neueZeilen()).toHaveLength(0);
  });

  it("verlangt eine Charge — es gibt hier keinen FEFO-Rueckfall", async () => {
    // Der Unterschied zum Hinweg, als Zusicherung: dort ist `chargeId`
    // optional, hier Pflicht. Ein fehlendes Feld ist eine offene Entscheidung,
    // und die bucht nicht.
    schrank("sch-1", "Schrank 1");
    charge("ch-1", "2030-01");
    inDerBox("seed-1", "ch-1", 5);

    const erg = await raeumeAusEntnahmebox(
      { artikelId: "art-1", menge: 1, zielLagerortId: "sch-1" },
      t.db,
    );

    expect(erg.ok).toBe(false);
    expect(erg.ok === false && erg.grund).toBe("eingabe");
    expect(neueZeilen()).toHaveLength(0);
  });

  it("verlangt ein Ziel — ein fehlendes ist keine Vorgabe auf die Wurzel", async () => {
    charge("ch-1", "2030-01");
    inDerBox("seed-1", "ch-1", 5);

    const erg = await raeumeAusEntnahmebox(
      { artikelId: "art-1", chargeId: "ch-1", menge: 1 },
      t.db,
    );

    expect(erg.ok).toBe(false);
    expect(neueZeilen()).toHaveLength(0);
  });

  it("raeumt keinen Pfad aus, wenn nichts gebucht wurde", async () => {
    schrank("sch-1", "Schrank 1");
    charge("ch-1", "2030-01");
    inDerBox("seed-1", "ch-1", 1);

    await raeumeAusEntnahmebox(
      { artikelId: "art-1", chargeId: "ch-1", menge: 9, zielLagerortId: "sch-1" },
      t.db,
    );

    expect(revalidiert).toEqual([]);
  });
});
