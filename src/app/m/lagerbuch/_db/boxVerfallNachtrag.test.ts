import { registerAuditFunctions } from "@/core/audit/context";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import {
  copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

/**
 * DRK-377 — die ZWEITE HAELFTE von `0013_box_verfall_nachtrag.sql`, die
 * `migrations.test.ts` strukturell nicht sehen kann: dort laeuft die Migration
 * gegen eine LEERE Datenbank, und in der liegt nichts in der Kiste. Der
 * Nachtrag waere dort gruen, ohne je eine Zeile getragen zu haben — und faellt
 * erst auf der einen Datenbank auf, auf der er zaehlt: der bestehenden.
 *
 * Derselbe Umweg wie in `dubletten.test.ts`: 0000–0012 in einen Wegwerf-Ordner,
 * migrieren, den Altstand einlegen, DANN 0013 abspielen. `migrate()` liest
 * immer das ganze Verzeichnis; anders ist der Stand VOR 0013 nicht herstellbar.
 */
const ORDNER = "src/app/m/lagerbuch/_db/migrations";
const BIS = [
  "0000_dear_magneto", "0001_append_only", "0002_bz_kontrollen_append_only",
  "0003_handlager", "0004_audit_outbox", "0005_artikel_kategorie",
  "0006_inventuren", "0007_o2_wechsel_grenze", "0008_lagerorte_hierarchie",
  "0009_lagerorte_name_eindeutig", "0010_einheitenart", "0011_bz_beachtung",
  "0012_entnahmebox",
];

type Journal = { version: string; dialect: string; entries: { tag: string }[] };

let aufraeumen: (() => void) | null = null;
afterEach(() => { aufraeumen?.(); aufraeumen = null; });

/** Eine Datenbank auf dem Stand VOR 0013 — mit der Box aus 0012, aber ohne
 *  jeden Nachtrag. */
function standVor0013(): Database.Database {
  const tmp = mkdtempSync(join(tmpdir(), "lagerbuch-boxverfall-"));
  const teilordner = join(tmp, "migrations");
  mkdirSync(join(teilordner, "meta"), { recursive: true });
  for (const tag of BIS) {
    copyFileSync(join(ORDNER, `${tag}.sql`), join(teilordner, `${tag}.sql`));
  }
  const journal = JSON.parse(
    readFileSync(join(ORDNER, "meta/_journal.json"), "utf8"),
  ) as Journal;
  journal.entries = journal.entries.filter((e) => BIS.includes(e.tag));
  expect(journal.entries).toHaveLength(BIS.length);
  writeFileSync(join(teilordner, "meta/_journal.json"), JSON.stringify(journal));

  const sqlite = new Database(join(tmp, "lagerbuch.db"));
  registerAuditFunctions(sqlite);
  sqlite.pragma("foreign_keys = ON");
  migrate(drizzle(sqlite), { migrationsFolder: teilordner });
  aufraeumen = () => { sqlite.close(); rmSync(tmp, { recursive: true, force: true }); };
  return sqlite;
}

function spiele0013(sqlite: Database.Database): void {
  sqlite.exec(readFileSync(join(ORDNER, "0013_box_verfall_nachtrag.sql"), "utf8"));
}

// ── Altstand einlegen ──────────────────────────────────────────────────────

const JETZT = 1_780_000_000;

function legeArtikel(sqlite: Database.Database, id: string): void {
  sqlite.prepare(
    "insert into artikel (id, name, einheit, fach, mindestbestand, aktiv, created_at)"
    + " values (?,?,'Stk.','A1',0,1,?)",
  ).run(id, `Artikel ${id}`, JETZT);
  sqlite.prepare(
    "insert into chargen (id, artikel_id, chargen_nr, verfall, created_at) values (?,?,?,?,?)",
  ).run(`ch-${id}`, id, "L1", "2099-12", JETZT);
}

function legeEinheit(sqlite: Database.Database, id: string): void {
  sqlite.prepare(
    "insert into lagerorte (id, name, typ, aktiv, parent_id, sortierung)"
    + " values (?,?,'fahrzeug',1,NULL,0)",
  ).run(id, `Einheit ${id}`);
}

/** Eine Buchung auf die Kiste, wie `bucheInEntnahmebox` sie schreibt: das
 *  Praefix nennt die QUELLE.
 *
 *  ⚠️ DIE VORGABE IST `JETZT + 60` UND NICHT `JETZT`, und das ist keine
 *  Kosmetik: die Ablesung schreibt der CHECK, die Abgabe eine getrennte
 *  Aktion — in der Produktion folgt sie ihr. Beide auf dieselbe Sekunde zu
 *  legen war Testbequemlichkeit und hat einen Gleichstand zum Normalfall
 *  gemacht, den der Nachtrag seit dem neunten Codex-Befund als MEHRDEUTIG
 *  abweist. Wer hier wieder `JETZT` einsetzt, prueft nicht den Nachtrag,
 *  sondern seine Abweisung. */
function bucheInKiste(
  sqlite: Database.Database,
  b: { artikelId: string; vonOrt: string; menge: number; ts?: number },
): void {
  sqlite.prepare(
    "insert into buchungen (id, ts, typ, artikel_id, charge_id, lagerort_id, menge,"
    + " quelle_typ, quelle_id, referenz, kommentar)"
    + " values (?,?,'umlagerung',?,?, 'entnahmebox', ?, 'oidc','wer', ?, 'Entnahmebox')",
  ).run(
    `bu-${b.artikelId}-${b.vonOrt}-${b.menge}-${b.ts ?? JETZT + 60}`, b.ts ?? JETZT + 60,
    b.artikelId, `ch-${b.artikelId}`, b.menge, `entnahmebox:${b.vonOrt}`,
  );
}

function meldeVerfall(
  sqlite: Database.Database,
  m: { ortId: string; artikelId: string; verfall: string; erfasstAt?: number },
): void {
  sqlite.prepare(
    "insert into lagerort_verfall (id, lagerort_id, artikel_id, verfall, erfasst_at,"
    + " quelle_typ, quelle_id) values (?,?,?,?,?,'token','helfer-1')",
  ).run(
    `lv-${m.ortId}-${m.artikelId}`, m.ortId, m.artikelId, m.verfall,
    m.erfasstAt ?? JETZT,
  );
}

type Zeile = {
  id: string; lagerort_id: string; artikel_id: string; verfall: string;
  erfasst_at: number; quelle_typ: string; quelle_id: string;
};

const meldungen = (sqlite: Database.Database, ortId: string) =>
  sqlite.prepare("select * from lagerort_verfall where lagerort_id = ? order by artikel_id")
    .all(ortId) as Zeile[];

// ── Die Faelle ─────────────────────────────────────────────────────────────

describe("0013 — der gemeldete Verfall fuer Bestand, der schon in der Kiste liegt", () => {
  it("traegt die Meldung der Herkunftseinheit an der Kiste nach", () => {
    const sqlite = standVor0013();
    legeArtikel(sqlite, "kompresse");
    legeEinheit(sqlite, "rtw");
    bucheInKiste(sqlite, { artikelId: "kompresse", vonOrt: "rtw", menge: 6 });
    meldeVerfall(sqlite, { ortId: "rtw", artikelId: "kompresse", verfall: "2026-10" });

    spiele0013(sqlite);

    const anDerKiste = meldungen(sqlite, "entnahmebox");
    expect(anDerKiste).toHaveLength(1);
    expect(anDerKiste[0]).toMatchObject({
      artikel_id: "kompresse", verfall: "2026-10",
      // ALS GANZES uebernommen: Ablesezeit und Quelle bleiben die der Meldung,
      // nicht die dieses Schritts (dieselbe Begruendung wie `uebernimmVerfall`).
      erfasst_at: JETZT, quelle_typ: "token", quelle_id: "helfer-1",
    });
  });

  it("nimmt KEINE Meldung, die NACH der Abgabe an der Einheit entstanden ist", () => {
    /**
     * ⚠️ DER SECHSTE CODEX-BEFUND ZU PR #194. `lagerort_verfall` fuehrt keine
     * Historie — ein spaeterer Check an der Herkunftseinheit ueberschreibt ihre
     * einzige Zeile. Ohne die Zeitprobe kopierte der Nachtrag diese neue
     * Beobachtung an die Kiste, obwohl sie an einer inzwischen neu bestueckten
     * Einheit gemacht wurde und das Kistenmaterial nie beschrieben hat.
     *
     * Der Schaden ist die TEURE Haelfte: 12/30 an einer Packung, die 10/26
     * ist, beruhigt zu Unrecht — waehrend „jedes Datum ist frueher als gar
     * keines" nur gilt, solange das Datum das Material auch meint.
     */
    const sqlite = standVor0013();
    legeArtikel(sqlite, "kompresse");
    legeEinheit(sqlite, "rtw");
    bucheInKiste(sqlite, { artikelId: "kompresse", vonOrt: "rtw", menge: 6, ts: JETZT });
    // Der Check kommt SPAETER als die Abgabe und ueberschreibt die Zeile.
    meldeVerfall(sqlite, {
      ortId: "rtw", artikelId: "kompresse", verfall: "2030-12", erfasstAt: JETZT + 3600,
    });

    spiele0013(sqlite);

    expect(meldungen(sqlite, "entnahmebox")).toHaveLength(0);
  });

  it("weist GLEICHSTAND auf die Sekunde als mehrdeutig ab", () => {
    /**
     * ⚠️ DER NEUNTE CODEX-BEFUND. Beide Zeiten sind SEKUNDEN (Falle 3 am
     * Schema). Faellt ein Check in dieselbe Sekunde wie die Lieferung, kann er
     * die Meldung danach ueberschrieben haben — nachweisbar „davor" ist der
     * Gleichstand nicht. Mehrdeutig heisst hier „nicht nachtragen".
     */
    const sqlite = standVor0013();
    legeArtikel(sqlite, "kompresse");
    legeEinheit(sqlite, "rtw");
    bucheInKiste(sqlite, { artikelId: "kompresse", vonOrt: "rtw", menge: 6, ts: JETZT });
    meldeVerfall(sqlite, {
      ortId: "rtw", artikelId: "kompresse", verfall: "2026-10", erfasstAt: JETZT,
    });

    spiele0013(sqlite);

    expect(meldungen(sqlite, "entnahmebox")).toHaveLength(0);
  });

  it("nimmt NICHTS, wenn aeltere Ware als die Meldung in der Kiste liegt", () => {
    /**
     * ⚠️ DER SIEBTE CODEX-BEFUND. Die Zeitprobe an der BUCHUNG reichte nicht:
     * sie liess jede Lieferung nach der Meldung gelten, auch wenn daneben
     * AELTERE Ware liegt, die die Meldung nie beschrieben hat.
     *
     *   T1  alte Ladung kommt in die Kiste (echt 10/26)
     *   T2  RTW-Check ueberschreibt die Meldung auf 12/30
     *   T3  zweite Ladung kommt — erfuellt „juenger als die Meldung"
     *   →   ohne diese Probe traegt die alte Ladung danach 12/30
     */
    const sqlite = standVor0013();
    legeArtikel(sqlite, "kompresse");
    legeEinheit(sqlite, "rtw");
    bucheInKiste(sqlite, { artikelId: "kompresse", vonOrt: "rtw", menge: 4, ts: JETZT });
    bucheInKiste(sqlite, { artikelId: "kompresse", vonOrt: "rtw", menge: 2, ts: JETZT + 7200 });
    // Der Check liegt ZWISCHEN den beiden Lieferungen.
    meldeVerfall(sqlite, {
      ortId: "rtw", artikelId: "kompresse", verfall: "2030-12", erfasstAt: JETZT + 3600,
    });

    spiele0013(sqlite);

    expect(meldungen(sqlite, "entnahmebox")).toHaveLength(0);
  });

  it("nimmt NICHTS, wenn aus der Kiste je etwas herausgebucht wurde", () => {
    /**
     * Die Zuordnung ist dann mehrdeutig: eine Buchung sagt, WIEVIEL an einen
     * Ort kam, nicht WELCHE Packung noch dort liegt. Die qualifizierende
     * Lieferung kann laengst wieder draussen sein, waehrend aeltere Ware den
     * Saldo positiv haelt.
     */
    const sqlite = standVor0013();
    legeArtikel(sqlite, "kompresse");
    legeEinheit(sqlite, "rtw");
    bucheInKiste(sqlite, { artikelId: "kompresse", vonOrt: "rtw", menge: 6, ts: JETZT });
    bucheInKiste(sqlite, { artikelId: "kompresse", vonOrt: "rtw", menge: -2, ts: JETZT + 60 });
    meldeVerfall(sqlite, { ortId: "rtw", artikelId: "kompresse", verfall: "2026-10" });

    spiele0013(sqlite);

    expect(meldungen(sqlite, "entnahmebox")).toHaveLength(0);
  });

  it("laesst die Zeile an der Einheit STEHEN — sie kopiert, sie verschiebt nicht", () => {
    // Zur Laufzeit faellt die Angabe an der Einheit, weil dort in derselben
    // Sekunde das letzte Stueck verschwindet. Hier liegt ein unbekannter
    // Zeitraum dazwischen: die Einheit ist laengst wieder bestueckt.
    const sqlite = standVor0013();
    legeArtikel(sqlite, "kompresse");
    legeEinheit(sqlite, "rtw");
    bucheInKiste(sqlite, { artikelId: "kompresse", vonOrt: "rtw", menge: 6 });
    meldeVerfall(sqlite, { ortId: "rtw", artikelId: "kompresse", verfall: "2026-10" });

    spiele0013(sqlite);

    expect(meldungen(sqlite, "rtw")).toHaveLength(1);
  });

  it("nimmt bei zwei Herkuenften das FRUEHERE Datum", () => {
    const sqlite = standVor0013();
    legeArtikel(sqlite, "kompresse");
    legeEinheit(sqlite, "rtw");
    legeEinheit(sqlite, "ktw");
    bucheInKiste(sqlite, { artikelId: "kompresse", vonOrt: "rtw", menge: 6 });
    bucheInKiste(sqlite, { artikelId: "kompresse", vonOrt: "ktw", menge: 4 });
    meldeVerfall(sqlite, { ortId: "rtw", artikelId: "kompresse", verfall: "2027-03" });
    meldeVerfall(sqlite, { ortId: "ktw", artikelId: "kompresse", verfall: "2026-05" });

    spiele0013(sqlite);

    expect(meldungen(sqlite, "entnahmebox")[0]).toMatchObject({ verfall: "2026-05" });
  });

  it("ueberschreibt eine Meldung nicht, die die Kiste schon fuehrt", () => {
    // Der neue Weg hat hier bereits geschrieben. Ein Nachtrag DARUEBER waere
    // keine Rettung, sondern ein Ueberschreiben mit einer aelteren Auskunft.
    const sqlite = standVor0013();
    legeArtikel(sqlite, "kompresse");
    legeEinheit(sqlite, "rtw");
    bucheInKiste(sqlite, { artikelId: "kompresse", vonOrt: "rtw", menge: 6 });
    meldeVerfall(sqlite, { ortId: "rtw", artikelId: "kompresse", verfall: "2026-01" });
    meldeVerfall(sqlite, {
      ortId: "entnahmebox", artikelId: "kompresse", verfall: "2028-08",
    });

    spiele0013(sqlite);

    const anDerKiste = meldungen(sqlite, "entnahmebox");
    expect(anDerKiste).toHaveLength(1);
    expect(anDerKiste[0]).toMatchObject({ verfall: "2028-08" });
  });

  it("traegt nichts nach, wenn von dem Artikel nichts mehr in der Kiste liegt", () => {
    const sqlite = standVor0013();
    legeArtikel(sqlite, "kompresse");
    legeEinheit(sqlite, "rtw");
    bucheInKiste(sqlite, { artikelId: "kompresse", vonOrt: "rtw", menge: 6 });
    bucheInKiste(sqlite, {
      artikelId: "kompresse", vonOrt: "rtw", menge: -6, ts: JETZT + 60,
    });
    meldeVerfall(sqlite, { ortId: "rtw", artikelId: "kompresse", verfall: "2026-10" });

    spiele0013(sqlite);

    expect(meldungen(sqlite, "entnahmebox")).toEqual([]);
  });

  it("traegt nichts nach fuer eine Einheit, die diesen Artikel nie abgegeben hat", () => {
    // Die Meldung am KTW gehoert zu Material, das nie in der Kiste war. Ohne
    // die Herkunftsprobe stuende sie jetzt an der Kiste.
    const sqlite = standVor0013();
    legeArtikel(sqlite, "kompresse");
    legeEinheit(sqlite, "rtw");
    legeEinheit(sqlite, "ktw");
    bucheInKiste(sqlite, { artikelId: "kompresse", vonOrt: "rtw", menge: 6 });
    meldeVerfall(sqlite, { ortId: "ktw", artikelId: "kompresse", verfall: "2026-02" });

    spiele0013(sqlite);

    expect(meldungen(sqlite, "entnahmebox")).toEqual([]);
  });

  it("ist wiederholbar — ein zweiter Lauf legt keine zweite Zeile an", () => {
    // Migrationen laufen einmal; der Riegel `NOT EXISTS` haelt den Schritt
    // trotzdem wiederholbar, damit ein Nachspielen von Hand nichts anrichtet.
    const sqlite = standVor0013();
    legeArtikel(sqlite, "kompresse");
    legeEinheit(sqlite, "rtw");
    bucheInKiste(sqlite, { artikelId: "kompresse", vonOrt: "rtw", menge: 6 });
    meldeVerfall(sqlite, { ortId: "rtw", artikelId: "kompresse", verfall: "2026-10" });

    spiele0013(sqlite);
    spiele0013(sqlite);

    expect(meldungen(sqlite, "entnahmebox")).toHaveLength(1);
  });

  it("traegt je Artikel getrennt nach", () => {
    const sqlite = standVor0013();
    legeArtikel(sqlite, "kompresse");
    legeArtikel(sqlite, "binde");
    legeEinheit(sqlite, "rtw");
    bucheInKiste(sqlite, { artikelId: "kompresse", vonOrt: "rtw", menge: 6 });
    bucheInKiste(sqlite, { artikelId: "binde", vonOrt: "rtw", menge: 2 });
    meldeVerfall(sqlite, { ortId: "rtw", artikelId: "kompresse", verfall: "2026-10" });
    meldeVerfall(sqlite, { ortId: "rtw", artikelId: "binde", verfall: "2027-01" });

    spiele0013(sqlite);

    expect(meldungen(sqlite, "entnahmebox").map((z) => [z.artikel_id, z.verfall]))
      .toEqual([["binde", "2027-01"], ["kompresse", "2026-10"]]);
  });
});
