import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as schema from "./schema";

const ORDNER = "src/app/m/lagerbuch/_db/migrations";
/** Die eingecheckte Herkunftskopie — liegt NEBEN `migrations/`, nie darin: der
 *  Migrator darf sie nicht einlesen. Siehe `_db/herkunft/README.md`. */
const HERKUNFT = "src/app/m/lagerbuch/_db/herkunft/0001_append_only.ca04eb1.sql";
/** Das Alt-Repo, eingefroren auf ca04eb1. Liegt nur im Arbeitsbaum, nicht in der CI. */
const ALT_REPO = "../lagerbuch/drizzle/0001_append_only.sql";

/**
 * „Das Schema ist das, was §4 behauptet." Wer ein Migrationsverzeichnis kopiert, hat
 * das Alt-Schema per Definition; wer es REGENERIERT, behauptet es. Diese Datei loest
 * die Behauptung dauerhaft ein; der einmalige Schema-Diff gegen die Alt-App (T14)
 * loest sie fuer den Zeitpunkt des Ports ein.
 *
 * Gegen eine temporaere DATEI-DB, nicht :memory: — und BEWUSST OHNE `migrierteTestDb`
 * aus testdb.ts: dieser Test prueft den Migrationslauf selbst und darf ihn nicht
 * hinter einem Helfer verstecken.
 */
let tmp: string;
let sqlite: Database.Database;
let db: ReturnType<typeof drizzle<typeof schema>>;

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "lagerbuch-migrations-"));
  sqlite = new Database(join(tmp, "lagerbuch.db"));
  // `foreign_keys` ist eine VERBINDUNGS-Eigenschaft und in SQLite standardmaessig AUS.
  // Ohne diese Zeile waeren alle FK-Zusagen unten gruen, ohne zu gelten.
  sqlite.pragma("foreign_keys = ON");
  migrate(drizzle(sqlite), { migrationsFolder: ORDNER });
  db = drizzle(sqlite, { schema });
});

afterAll(() => {
  sqlite.close();
  rmSync(tmp, { recursive: true, force: true });
});

type SpalteInfo = { name: string; type: string; notnull: number; dflt_value: string | null };
type IndexInfo = { name: string; unique: number; origin: string };

const spalten = (tabelle: string) =>
  sqlite.prepare(`PRAGMA table_info(${tabelle})`).all() as SpalteInfo[];

/** Alle Indizes AUSSER den PK-Autoindizes (`sqlite_autoindex_*`, origin "pk").
 *  Die drei UNIQUE-Indizes tokens_code_unique, geraete_barcode_unique und
 *  bz_geraete_barcode_unique GEHOEREN dazu — drizzle-kit emittiert sie als eigene
 *  `CREATE UNIQUE INDEX`-Anweisungen (origin "c"), nicht als Spaltenconstraint. */
const indizes = (tabelle: string) =>
  (sqlite.prepare(`PRAGMA index_list(${tabelle})`).all() as IndexInfo[])
    .filter((i) => i.origin !== "pk")
    .map((i) => i.name)
    .sort();

const TABELLEN: Record<string, { name: string; typ: string; notnull: 0 | 1; dflt: string | null }[]> = {
  lagerorte: [
    { name: "id", typ: "text", notnull: 1, dflt: null },
    { name: "name", typ: "text", notnull: 1, dflt: null },
    { name: "typ", typ: "text", notnull: 1, dflt: null },
    { name: "kennung", typ: "text", notnull: 0, dflt: null },
    { name: "aktiv", typ: "integer", notnull: 1, dflt: "true" },
    { name: "template_id", typ: "text", notnull: 0, dflt: null },
  ],
  fahrzeug_templates: [
    { name: "id", typ: "text", notnull: 1, dflt: null },
    { name: "name", typ: "text", notnull: 1, dflt: null },
    { name: "aktiv", typ: "integer", notnull: 1, dflt: "true" },
    { name: "created_at", typ: "integer", notnull: 1, dflt: null },
  ],
  template_positionen: [
    { name: "id", typ: "text", notnull: 1, dflt: null },
    { name: "template_id", typ: "text", notnull: 1, dflt: null },
    { name: "fach_label", typ: "text", notnull: 1, dflt: null },
    { name: "sort", typ: "integer", notnull: 1, dflt: "0" },
    { name: "artikel_id", typ: "text", notnull: 1, dflt: null },
    { name: "soll", typ: "integer", notnull: 1, dflt: null },
  ],
  artikel: [
    { name: "id", typ: "text", notnull: 1, dflt: null },
    { name: "name", typ: "text", notnull: 1, dflt: null },
    { name: "einheit", typ: "text", notnull: 1, dflt: null },
    { name: "fach", typ: "text", notnull: 1, dflt: null },
    { name: "mindestbestand", typ: "integer", notnull: 1, dflt: "0" },
    { name: "aktiv", typ: "integer", notnull: 1, dflt: "true" },
    { name: "bestellt_at", typ: "integer", notnull: 0, dflt: null },
    { name: "created_at", typ: "integer", notnull: 1, dflt: null },
  ],
  chargen: [
    { name: "id", typ: "text", notnull: 1, dflt: null },
    { name: "artikel_id", typ: "text", notnull: 1, dflt: null },
    { name: "chargen_nr", typ: "text", notnull: 1, dflt: null },
    { name: "verfall", typ: "text", notnull: 1, dflt: null },
    { name: "created_at", typ: "integer", notnull: 1, dflt: null },
  ],
  soll_positionen: [
    { name: "id", typ: "text", notnull: 1, dflt: null },
    { name: "fahrzeug_id", typ: "text", notnull: 1, dflt: null },
    { name: "fach_label", typ: "text", notnull: 1, dflt: null },
    { name: "sort", typ: "integer", notnull: 1, dflt: "0" },
    { name: "artikel_id", typ: "text", notnull: 1, dflt: null },
    { name: "soll", typ: "integer", notnull: 1, dflt: null },
    { name: "template_position_id", typ: "text", notnull: 0, dflt: null },
    { name: "ueberschrieben", typ: "integer", notnull: 1, dflt: "false" },
    { name: "entfernt", typ: "integer", notnull: 1, dflt: "false" },
  ],
  buchungen: [
    { name: "id", typ: "text", notnull: 1, dflt: null },
    { name: "ts", typ: "integer", notnull: 1, dflt: null },
    { name: "typ", typ: "text", notnull: 1, dflt: null },
    { name: "artikel_id", typ: "text", notnull: 1, dflt: null },
    { name: "charge_id", typ: "text", notnull: 1, dflt: null },
    { name: "lagerort_id", typ: "text", notnull: 1, dflt: null },
    { name: "menge", typ: "integer", notnull: 1, dflt: null },
    { name: "quelle_typ", typ: "text", notnull: 1, dflt: null },
    { name: "quelle_id", typ: "text", notnull: 1, dflt: null },
    { name: "referenz", typ: "text", notnull: 0, dflt: null },
    { name: "kommentar", typ: "text", notnull: 0, dflt: null },
  ],
  checks: [
    { name: "id", typ: "text", notnull: 1, dflt: null },
    { name: "fahrzeug_id", typ: "text", notnull: 1, dflt: null },
    { name: "quelle_typ", typ: "text", notnull: 1, dflt: null },
    { name: "quelle_id", typ: "text", notnull: 1, dflt: null },
    { name: "started_at", typ: "integer", notnull: 1, dflt: null },
    { name: "completed_at", typ: "integer", notnull: 0, dflt: null },
    { name: "ergebnis", typ: "text", notnull: 0, dflt: null },
  ],
  lagerort_verfall: [
    { name: "id", typ: "text", notnull: 1, dflt: null },
    { name: "lagerort_id", typ: "text", notnull: 1, dflt: null },
    { name: "artikel_id", typ: "text", notnull: 1, dflt: null },
    { name: "verfall", typ: "text", notnull: 1, dflt: null },
    { name: "erfasst_at", typ: "integer", notnull: 1, dflt: null },
    { name: "quelle_typ", typ: "text", notnull: 1, dflt: null },
    { name: "quelle_id", typ: "text", notnull: 1, dflt: null },
  ],
  bz_geraete: [
    { name: "id", typ: "text", notnull: 1, dflt: null },
    { name: "barcode", typ: "text", notnull: 0, dflt: null },
    { name: "name", typ: "text", notnull: 1, dflt: null },
    { name: "lagerort_id", typ: "text", notnull: 1, dflt: null },
    { name: "streifen_lot", typ: "text", notnull: 0, dflt: null },
    { name: "level1_label", typ: "text", notnull: 0, dflt: null },
    { name: "level1_min", typ: "integer", notnull: 0, dflt: null },
    { name: "level1_max", typ: "integer", notnull: 0, dflt: null },
    { name: "level2_label", typ: "text", notnull: 0, dflt: null },
    { name: "level2_min", typ: "integer", notnull: 0, dflt: null },
    { name: "level2_max", typ: "integer", notnull: 0, dflt: null },
    { name: "aktiv", typ: "integer", notnull: 1, dflt: "true" },
    { name: "created_at", typ: "integer", notnull: 1, dflt: null },
  ],
  bz_kontrollen: [
    { name: "id", typ: "text", notnull: 1, dflt: null },
    { name: "geraet_id", typ: "text", notnull: 1, dflt: null },
    { name: "ts", typ: "integer", notnull: 1, dflt: null },
    { name: "quelle_typ", typ: "text", notnull: 1, dflt: null },
    { name: "quelle_id", typ: "text", notnull: 1, dflt: null },
    { name: "level1_wert", typ: "integer", notnull: 0, dflt: null },
    { name: "level1_im_bereich", typ: "integer", notnull: 0, dflt: null },
    { name: "level2_wert", typ: "integer", notnull: 0, dflt: null },
    { name: "level2_im_bereich", typ: "integer", notnull: 0, dflt: null },
    { name: "kompresse_verfall", typ: "text", notnull: 0, dflt: null },
    { name: "sticks", typ: "integer", notnull: 1, dflt: "0" },
    { name: "lanzetten", typ: "integer", notnull: 1, dflt: "0" },
    { name: "batterie_gewechselt", typ: "integer", notnull: 1, dflt: "false" },
    { name: "kommentar", typ: "text", notnull: 0, dflt: null },
    { name: "bestanden", typ: "integer", notnull: 1, dflt: null },
    { name: "ref_snapshot", typ: "text", notnull: 0, dflt: null },
  ],
  o2_flaschen: [
    { name: "id", typ: "text", notnull: 1, dflt: null },
    { name: "name", typ: "text", notnull: 1, dflt: null },
    { name: "lagerort_id", typ: "text", notnull: 1, dflt: null },
    { name: "groesse_liter", typ: "integer", notnull: 0, dflt: null },
    { name: "nennfuelldruck_bar", typ: "integer", notnull: 1, dflt: "200" },
    { name: "aktiv", typ: "integer", notnull: 1, dflt: "true" },
    { name: "created_at", typ: "integer", notnull: 1, dflt: null },
  ],
  o2_messungen: [
    { name: "id", typ: "text", notnull: 1, dflt: null },
    { name: "flasche_id", typ: "text", notnull: 1, dflt: null },
    { name: "ts", typ: "integer", notnull: 1, dflt: null },
    { name: "druck_bar", typ: "integer", notnull: 1, dflt: null },
    { name: "quelle_typ", typ: "text", notnull: 1, dflt: null },
    { name: "quelle_id", typ: "text", notnull: 1, dflt: null },
    { name: "kommentar", typ: "text", notnull: 0, dflt: null },
  ],
  geraete: [
    { name: "id", typ: "text", notnull: 1, dflt: null },
    { name: "typ", typ: "text", notnull: 1, dflt: null },
    { name: "barcode", typ: "text", notnull: 0, dflt: null },
    { name: "name", typ: "text", notnull: 1, dflt: null },
    { name: "lagerort_id", typ: "text", notnull: 1, dflt: null },
    { name: "anmerkung", typ: "text", notnull: 0, dflt: null },
    { name: "mtk_faellig", typ: "text", notnull: 0, dflt: null },
    { name: "beschreibung", typ: "text", notnull: 0, dflt: null },
    { name: "ablaufdatum", typ: "text", notnull: 0, dflt: null },
    { name: "aktiv", typ: "integer", notnull: 1, dflt: "true" },
    { name: "created_at", typ: "integer", notnull: 1, dflt: null },
  ],
  tokens: [
    { name: "id", typ: "text", notnull: 1, dflt: null },
    { name: "code", typ: "text", notnull: 1, dflt: null },
    { name: "label", typ: "text", notnull: 1, dflt: null },
    { name: "scope_lagerort_id", typ: "text", notnull: 0, dflt: null },
    { name: "ziel_typ", typ: "text", notnull: 0, dflt: null },
    { name: "ziel_id", typ: "text", notnull: 0, dflt: null },
    { name: "aktiv", typ: "integer", notnull: 1, dflt: "true" },
    { name: "created_at", typ: "integer", notnull: 1, dflt: null },
    { name: "created_by", typ: "text", notnull: 1, dflt: null },
    { name: "last_used_at", typ: "integer", notnull: 0, dflt: null },
  ],
  users: [
    { name: "id", typ: "text", notnull: 1, dflt: null },
    { name: "name", typ: "text", notnull: 0, dflt: null },
    { name: "email", typ: "text", notnull: 0, dflt: null },
    { name: "last_login_at", typ: "integer", notnull: 0, dflt: null },
  ],
};

describe("16 Tabellen, Spalte fuer Spalte", () => {
  it("es sind genau 16 und keine mehr", () => {
    const namen = (sqlite.prepare(
      `select name from sqlite_master where type='table'
         and name not like 'sqlite_%' and name not like '__drizzle%' order by name`,
    ).all() as { name: string }[]).map((r) => r.name);
    expect(namen.sort()).toEqual(Object.keys(TABELLEN).sort());
  });

  it.each(Object.entries(TABELLEN))("%s", (tabelle, erwartet) => {
    const ist = spalten(tabelle).map((s) => ({
      name: s.name, typ: s.type.toLowerCase(), notnull: s.notnull as 0 | 1, dflt: s.dflt_value,
    }));
    expect(ist).toEqual(erwartet);
  });
});

const INDIZES: Record<string, string[]> = {
  lagerorte: [],
  fahrzeug_templates: [],
  template_positionen: ["idx_template_pos_template"],
  artikel: [],
  chargen: ["idx_chargen_artikel_verfall"],
  soll_positionen: ["idx_soll_fahrzeug"],
  buchungen: [
    "idx_buchungen_artikel",
    "idx_buchungen_artikel_lagerort_charge",   // neu, S3
    "idx_buchungen_charge",
    "idx_buchungen_lagerort_artikel",          // neu, S3
    "idx_buchungen_ts",
    "idx_buchungen_ts_id",                     // neu, S3
  ],
  checks: ["idx_checks_fahrzeug_completed"],   // neu, S3 — checks hatte KEINEN Index
  lagerort_verfall: ["idx_lagerort_verfall_ort_artikel"],
  bz_geraete: ["bz_geraete_barcode_unique", "idx_bz_geraete_lagerort"],
  bz_kontrollen: ["idx_bz_kontrollen_geraet_ts"],
  o2_flaschen: ["idx_o2_flaschen_lagerort"],
  o2_messungen: ["idx_o2_messungen_flasche_ts"],
  geraete: ["geraete_barcode_unique", "idx_geraete_lagerort"],
  tokens: ["tokens_code_unique"],
  users: [],
};

describe("Indizes — alle bestehenden bleiben, vier kommen dazu", () => {
  it.each(Object.entries(INDIZES))("%s", (tabelle, erwartet) => {
    expect(indizes(tabelle)).toEqual([...erwartet].sort());
  });

  it("idx_lagerort_verfall_ort_artikel ist UNIQUE", () => {
    const l = sqlite.prepare("PRAGMA index_list(lagerort_verfall)").all() as IndexInfo[];
    expect(l.find((i) => i.name === "idx_lagerort_verfall_ort_artikel")?.unique).toBe(1);
  });

  it("die vier neuen Indizes tragen genau die Spalten aus S3", () => {
    const sp = (name: string) =>
      (sqlite.prepare(`PRAGMA index_info(${name})`).all() as { name: string }[]).map((r) => r.name);
    expect(sp("idx_buchungen_ts_id")).toEqual(["ts", "id"]);
    expect(sp("idx_buchungen_lagerort_artikel")).toEqual(["lagerort_id", "artikel_id"]);
    expect(sp("idx_buchungen_artikel_lagerort_charge"))
      .toEqual(["artikel_id", "lagerort_id", "charge_id"]);
    expect(sp("idx_checks_fahrzeug_completed")).toEqual(["fahrzeug_id", "completed_at"]);
  });
});

describe("Zeitstempel-Einheit — der EINZIGE Test, der die 1000er-Falle sehen kann", () => {
  it("legt UNIX-SEKUNDEN ab: zehn Stellen, nicht dreizehn", () => {
    // Jede Pruefung, die ueber mode: "timestamp" schreibt UND liest, ist gegen die
    // Falle blind — beide Richtungen fahren dieselbe Umrechnung. Deshalb wird hier
    // der ROHE Spaltenwert gelesen.
    const jetzt = new Date(1770000000789);   // 789 ms, damit das Abschneiden sichtbar wird
    db.insert(schema.artikel).values({
      id: "ts-probe", name: "Mullbinde", einheit: "Stk.", fach: "A2",
      mindestbestand: 10, createdAt: jetzt,
    }).run();

    const roh = sqlite.prepare("select created_at from artikel where id = 'ts-probe'")
      .get() as { created_at: number };
    expect(roh.created_at).toBe(1770000000);
    expect(String(roh.created_at)).toHaveLength(10);

    // Gegenprobe: der Rueckweg multipliziert wieder auf Millisekunden.
    const zurueck = db.select().from(schema.artikel).all().find((a) => a.id === "ts-probe");
    expect(zurueck?.createdAt?.getTime()).toBe(1770000000000);
  });
});

describe("die Handlager-Zeile ist eine MIGRATIONSZEILE (S4)", () => {
  it("existiert nach der Migration, ohne Seed", () => {
    const z = sqlite.prepare("select id, name, typ, aktiv, template_id from lagerorte where id = 'handlager'")
      .get() as { id: string; name: string; typ: string; aktiv: number; template_id: string | null };
    expect(z).toEqual({ id: "handlager", name: "Handlager", typ: "lager", aktiv: 1, template_id: null });
  });

  it("0003 ist idempotent — ein zweiter Lauf legt keine zweite Zeile an", () => {
    sqlite.prepare(
      `INSERT OR IGNORE INTO lagerorte (id, name, typ, kennung, aktiv, template_id)
       VALUES ('handlager', 'Handlager', 'lager', NULL, 1, NULL)`,
    ).run();
    const n = sqlite.prepare("select count(*) c from lagerorte where id = 'handlager'")
      .get() as { c: number };
    expect(n.c).toBe(1);
  });
});

describe("foreign_keys beisst wirklich", () => {
  it("ein Insert in buchungen mit erfundener artikel_id wirft", () => {
    // Ohne `pragma foreign_keys = ON` waere die ganze Datei gruen, ohne etwas zu pruefen.
    expect(() => sqlite.prepare(
      `insert into buchungen (id, ts, typ, artikel_id, charge_id, lagerort_id, menge, quelle_typ, quelle_id)
       values ('fk-probe', 1770000000, 'zugang', 'gibt-es-nicht', 'auch-nicht', 'handlager', 1, 'system', 'test')`,
    ).run()).toThrow(/FOREIGN KEY constraint failed/);
  });
});

describe("meta/_journal.json — die Eigenschaft, an der ein stiller Migrationsfehler haengt", () => {
  const journal = JSON.parse(readFileSync(join(ORDNER, "meta/_journal.json"), "utf8")) as {
    entries: { idx: number; when: number; tag: string }[];
  };

  it("fuehrt vier Eintraege in aufsteigender idx-Reihenfolge", () => {
    expect(journal.entries.map((e) => e.idx)).toEqual([0, 1, 2, 3]);
  });

  it("`when` ist STRENG monoton", () => {
    // Ein nachtraeglich eingeschobener kleinerer `when` wird NIE ausgefuehrt — der
    // Migrator vergleicht nur `created_at` der letzten Zeile gegen `folderMillis`
    // und liest den gespeicherten Hash nie zurueck (1:1-Pflicht 9). Der Ausfall ist
    // still: Produktion und frische Dev-DB divergieren, beide gruen.
    const w = journal.entries.map((e) => e.when);
    for (let i = 1; i < w.length; i++) expect(w[i]).toBeGreaterThan(w[i - 1]);
  });

  it("jeder `tag` hat eine Datei, und die drei handgeschriebenen heissen wie erwartet", () => {
    for (const e of journal.entries) {
      expect(() => readFileSync(join(ORDNER, `${e.tag}.sql`), "utf8")).not.toThrow();
    }
    expect(journal.entries.map((e) => e.tag).slice(1))
      .toEqual(["0001_append_only", "0002_bz_kontrollen_append_only", "0003_handlager"]);
  });

  // ZWEI ZUSICHERUNGEN STATT EINER, weil die eine Kette zwei Glieder hat und nur das
  // erste ueberall haengt: die CI checkt ausschliesslich dieses Repo aus, ein Lesen
  // aus `../lagerbuch/` waere dort rot. Deshalb traegt in der CI die Gleichheit gegen
  // die eingecheckte Herkunftskopie; die Echtheit der Kopie selbst belegt die zweite,
  // die ohne Alt-Repo uebersprungen wird statt fehlzuschlagen.
  it("0001 ist WOERTLICH die eingecheckte Herkunftskopie aus lagerbuch@ca04eb1", () => {
    // Die Behauptung „0001 ist woertlich die Alt-Datei" ist nur deshalb woertlich
    // pruefbar, weil die zwei neuen Trigger in einer EIGENEN Datei stehen.
    const neu = readFileSync(join(ORDNER, "0001_append_only.sql"), "utf8");
    const beleg = readFileSync(HERKUNFT, "utf8");
    expect(neu).toBe(beleg);
  });

  it.skipIf(!existsSync(ALT_REPO))(
    "die Herkunftskopie ist WOERTLICH die Datei aus dem Alt-Repo",
    () => {
      const beleg = readFileSync(HERKUNFT, "utf8");
      const alt = readFileSync(ALT_REPO, "utf8");
      expect(beleg).toBe(alt);
    },
  );
});
