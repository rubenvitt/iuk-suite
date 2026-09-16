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
import { istNamensKollision } from "../_lib/schrankName";

/**
 * DRK-367 — die ERSTE HAELFTE von `0009_lagerorte_name_eindeutig.sql`, die
 * `migrations.test.ts` strukturell nicht sehen kann: dort laeuft die Migration
 * gegen eine LEERE Datenbank, und genau dort gibt es keine Dubletten. Der
 * Entdoppelungsschritt waere also gruen, ohne je etwas umbenannt zu haben — und
 * faellt erst auf der einen Datenbank auf, auf der er zaehlt.
 *
 * Deshalb der Umweg: 0000–0008 in einen Wegwerf-Ordner, migrieren, Dubletten
 * einlegen, DANN 0009 abspielen. Der Stand vor 0009 laesst sich nicht anders
 * herstellen — `migrate()` liest immer das ganze Verzeichnis.
 */
const ORDNER = "src/app/m/lagerbuch/_db/migrations";
const BIS = [
  "0000_dear_magneto", "0001_append_only", "0002_bz_kontrollen_append_only",
  "0003_handlager", "0004_audit_outbox", "0005_artikel_kategorie",
  "0006_inventuren", "0007_o2_wechsel_grenze", "0008_lagerorte_hierarchie",
];

type Journal = { version: string; dialect: string; entries: { tag: string }[] };

let aufraeumen: (() => void) | null = null;
afterEach(() => { aufraeumen?.(); aufraeumen = null; });

/** Eine Datenbank auf dem Stand VOR 0009 — der einzige Stand, auf dem die
 *  Entdoppelung etwas zu tun hat. */
function standVor0009(): Database.Database {
  const tmp = mkdtempSync(join(tmpdir(), "lagerbuch-dubletten-"));
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

/** 0009 am Stueck. Der Migrator wuerde an `--> statement-breakpoint` trennen;
 *  `exec()` liest die Zeile als gewoehnlichen `--`-Kommentar und braucht die
 *  Trennung nicht. */
function spiele0009(sqlite: Database.Database): void {
  sqlite.exec(readFileSync(join(ORDNER, "0009_lagerorte_name_eindeutig.sql"), "utf8"));
}

function legeOrt(
  sqlite: Database.Database,
  o: { id: string; name: string; parent?: string | null; sortierung?: number;
       typ?: "lager" | "fahrzeug" },
): void {
  sqlite.prepare(
    "insert into lagerorte (id, name, typ, aktiv, parent_id, sortierung) values (?,?,?,1,?,?)",
  ).run(o.id, o.name, o.typ ?? "lager", o.parent === undefined ? "handlager" : o.parent,
    o.sortierung ?? 0);
}

const namen = (sqlite: Database.Database) =>
  (sqlite.prepare("select id, name from lagerorte order by id").all() as
    { id: string; name: string }[]);

describe("0009 — bestehende Dubletten blockieren den Start nicht", () => {
  it("der zuerst gegriffene Schrank behaelt seinen Namen, der zweite bekommt den Zusatz", () => {
    const sqlite = standVor0009();
    legeOrt(sqlite, { id: "a", name: "Schrank 1", sortierung: 10 });
    legeOrt(sqlite, { id: "b", name: "Schrank 1", sortierung: 20 });

    spiele0009(sqlite);

    expect(namen(sqlite).filter((o) => o.id === "a" || o.id === "b")).toEqual([
      { id: "a", name: "Schrank 1" },
      { id: "b", name: "Schrank 1 (Dublette 2)" },
    ]);
  });

  it("die Reihenfolge entscheidet, nicht die Einfuegereihenfolge", () => {
    // Waere `rowid` allein der Rang, behielte hier „b" den Namen — der Schrank,
    // den eine Entnahme ZULETZT anfasst. Der vorne stehende soll ihn behalten.
    const sqlite = standVor0009();
    legeOrt(sqlite, { id: "b", name: "Schrank 1", sortierung: 30 });
    legeOrt(sqlite, { id: "a", name: "Schrank 1", sortierung: 5 });

    spiele0009(sqlite);

    expect(namen(sqlite).filter((o) => o.id === "a" || o.id === "b")).toEqual([
      { id: "a", name: "Schrank 1" },
      { id: "b", name: "Schrank 1 (Dublette 2)" },
    ]);
  });

  it("Schreibweise und Leerraum zaehlen als derselbe Name", () => {
    const sqlite = standVor0009();
    legeOrt(sqlite, { id: "a", name: "Schrank 1", sortierung: 1 });
    legeOrt(sqlite, { id: "b", name: "schrank 1 ", sortierung: 2 });
    legeOrt(sqlite, { id: "c", name: "SCHRANK 1", sortierung: 3 });

    spiele0009(sqlite);

    // ⚠️ DIE BASIS IST DER NAME, DER BLEIBT, nicht die eigene Schreibweise der
    // Dublette: sonst stuenden „schrank 1  (Dublette 2)" und „SCHRANK 1
    // (Dublette 3)" untereinander und saehen aus wie drei verschiedene Faelle.
    expect(namen(sqlite).filter((o) => "abc".includes(o.id))).toEqual([
      { id: "a", name: "Schrank 1" },
      { id: "b", name: "Schrank 1 (Dublette 2)" },
      { id: "c", name: "Schrank 1 (Dublette 3)" },
    ]);
  });

  /**
   * SCHRITT 0 — Randleerraum, den SQLite anders sieht als JavaScript.
   * „\tSchrank 1" neben „Schrank 1" ueberlebte beide Ebenen und saehe auf dem
   * Schirm trotzdem gleich aus, weil HTML fuehrenden Leerraum wegfaltet — genau
   * die Mehrdeutigkeit, die das Ticket abstellt (Befund von Codex zu PR #166).
   * Nach dem Ausraeumen ist es eine gewoehnliche Dublette.
   */
  it("raeumt exotischen Randleerraum aus und entdoppelt, was dadurch gleich wird", () => {
    const sqlite = standVor0009();
    legeOrt(sqlite, { id: "a", name: "Schrank 1", sortierung: 10 });
    legeOrt(sqlite, { id: "b", name: "\tSchrank 1", sortierung: 20 });
    legeOrt(sqlite, { id: "c", name: "GF-Schrank\u00a0", sortierung: 30 });
    legeOrt(sqlite, { id: "d", name: "\u3000Regal\ufeff", sortierung: 40 });

    spiele0009(sqlite);

    expect(namen(sqlite).filter((o) => "abcd".includes(o.id))).toEqual([
      { id: "a", name: "Schrank 1" },
      { id: "b", name: "Schrank 1 (Dublette 2)" },
      // Kein Partner, also nur geputzt — der Name bleibt sonst, wie er war.
      { id: "c", name: "GF-Schrank" },
      { id: "d", name: "Regal" },
    ]);
  });

  /** Leerraum im INNEREN ist ein Zeichen wie jedes andere und bleibt. Wer ihn
   *  mitraeumte, benennte Schraenke um, die niemand angefasst hat. */
  it("laesst Leerraum im Inneren unberuehrt", () => {
    const sqlite = standVor0009();
    legeOrt(sqlite, { id: "a", name: "Schrank\t1" });
    legeOrt(sqlite, { id: "b", name: "Schrank  2" });

    spiele0009(sqlite);

    expect(namen(sqlite).filter((o) => o.id === "a" || o.id === "b")).toEqual([
      { id: "a", name: "Schrank\t1" },
      { id: "b", name: "Schrank  2" },
    ]);
  });

  /**
   * DER FALL, DER DEN START GEKOSTET HAETTE (Befund von Codex zu PR #166).
   * Zwei „Schrank 1" neben einem eigenstaendigen „Schrank 1 (Dublette 2)" sind
   * erlaubte Altdaten. Eine aus dem Rang GERECHNETE Nummer haette der zweiten
   * Zeile genau den Namen der dritten gegeben, der `CREATE UNIQUE INDEX`
   * darunter waere abgebrochen — und mit ihm der Modulstart. Die Nummer wird
   * deshalb gesucht.
   */
  it("ueberspringt eine Nummer, die ein Geschwister schon traegt", () => {
    const sqlite = standVor0009();
    legeOrt(sqlite, { id: "a", name: "Schrank 1", sortierung: 10 });
    legeOrt(sqlite, { id: "b", name: "Schrank 1", sortierung: 20 });
    legeOrt(sqlite, { id: "c", name: "Schrank 1 (Dublette 2)", sortierung: 30 });
    legeOrt(sqlite, { id: "d", name: "Schrank 1", sortierung: 40 });

    // Bricht diese Zeile, ist es der `CREATE UNIQUE INDEX` — also genau der
    // Ausfall, den der Schritt verhindern soll.
    spiele0009(sqlite);

    expect(namen(sqlite).filter((o) => "abcd".includes(o.id))).toEqual([
      { id: "a", name: "Schrank 1" },
      { id: "b", name: "Schrank 1 (Dublette 3)" },
      { id: "c", name: "Schrank 1 (Dublette 2)" },
      { id: "d", name: "Schrank 1 (Dublette 4)" },
    ]);
  });

  /**
   * Die Gegenprobe zur ASCII-Faltung: „Schränkchen" und „SCHRÄNKCHEN" sind fuer
   * SQLites `lower()` VERSCHIEDEN, bleiben also stehen — und `normalisiere-
   * SchrankName` sieht das genauso (`_lib/schrankName.test.ts` misst die
   * Gleichheit). Waere die Action strenger, stuenden hier Altdaten, die sie
   * danach fuer gleich haelt, und kein Rettungsname kaeme mehr durch.
   */
  it("laesst Namen stehen, die sich nur in der Groesse eines Umlauts unterscheiden", () => {
    const sqlite = standVor0009();
    legeOrt(sqlite, { id: "a", name: "Schränkchen", sortierung: 1 });
    legeOrt(sqlite, { id: "b", name: "SCHRÄNKCHEN", sortierung: 2 });

    spiele0009(sqlite);

    expect(namen(sqlite).filter((o) => o.id === "a" || o.id === "b")).toEqual([
      { id: "a", name: "Schränkchen" },
      { id: "b", name: "SCHRÄNKCHEN" },
    ]);
  });

  it("verschiedene Namen bleiben unberuehrt", () => {
    const sqlite = standVor0009();
    legeOrt(sqlite, { id: "a", name: "Schrank 1" });
    legeOrt(sqlite, { id: "b", name: "GF-Schrank" });

    spiele0009(sqlite);

    expect(namen(sqlite).filter((o) => o.id === "a" || o.id === "b")).toEqual([
      { id: "a", name: "Schrank 1" },
      { id: "b", name: "GF-Schrank" },
    ]);
  });

  it("zwei gleichnamige FAHRZEUGE bleiben stehen und halten die Migration nicht auf", () => {
    // `parent_id IS NULL` — der Index deckt sie nicht, und dieses Ticket auch
    // nicht. Faengt der Index sie doch, bricht `spiele0009` hier ab.
    const sqlite = standVor0009();
    legeOrt(sqlite, { id: "f1", name: "MTW 1", parent: null, typ: "fahrzeug" });
    legeOrt(sqlite, { id: "f2", name: "MTW 1", parent: null, typ: "fahrzeug" });

    spiele0009(sqlite);

    expect(namen(sqlite).filter((o) => o.id.startsWith("f"))).toEqual([
      { id: "f1", name: "MTW 1" },
      { id: "f2", name: "MTW 1" },
    ]);
  });

  it("die Umbenennung steht als Systemaenderung im Audit-Protokoll", () => {
    // Ohne Audit-Kontext liefert `suite_audit_actor()` `{"kind":"system"}`. Ein
    // Namenswechsel, den niemand veranlasst hat, muss irgendwo stehen.
    const sqlite = standVor0009();
    legeOrt(sqlite, { id: "a", name: "Schrank 1", sortierung: 1 });
    legeOrt(sqlite, { id: "b", name: "Schrank 1", sortierung: 2 });
    sqlite.prepare("delete from audit_outbox").run();

    spiele0009(sqlite);

    const zeilen = sqlite.prepare(
      "select actor, action, object_type from audit_outbox",
    ).all() as { actor: string; action: string; object_type: string }[];
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0]!.action).toBe("update");
    expect(zeilen[0]!.object_type).toBe("lagerorte");
    expect(JSON.parse(zeilen[0]!.actor)).toEqual({ kind: "system" });
  });

  it("nach der Migration wird ein doppelter Name abgewiesen — auch am SQL vorbei", () => {
    const sqlite = standVor0009();
    legeOrt(sqlite, { id: "a", name: "Schrank 1" });
    spiele0009(sqlite);

    expect(() => legeOrt(sqlite, { id: "b", name: "Schrank 1" }))
      .toThrow(/UNIQUE constraint failed/i);
    expect(() => legeOrt(sqlite, { id: "c", name: " schrank 1" }))
      .toThrow(/UNIQUE constraint failed/i);
    expect(() => legeOrt(sqlite, { id: "d", name: "Schrank 2" })).not.toThrow();
  });

  it("und die Action erkennt diese Ausnahme als Namenskollision wieder", () => {
    // ⚠️ GEMESSEN, NICHT GERATEN: `istNamensKollision` liest eine
    // Zeichenkette, die SQLite formuliert — „UNIQUE constraint failed: index
    // 'idx_lagerorte_name_je_parent'". Ein hier festgeschriebener Satz waere
    // eine Behauptung ueber eine fremde Bibliothek; deshalb faellt die Ausnahme
    // in diesem Test wirklich an. Ohne die Uebersetzung stuende im Formular
    // „Schrank konnte nicht angelegt werden." und der Grund waere weg.
    const sqlite = standVor0009();
    legeOrt(sqlite, { id: "a", name: "Schrank 1" });
    spiele0009(sqlite);

    let gefangen: unknown = null;
    try { legeOrt(sqlite, { id: "b", name: "Schrank 1" }); } catch (e) { gefangen = e; }
    expect(gefangen).toBeInstanceOf(Error);
    expect(istNamensKollision(gefangen)).toBe(true);
    expect(istNamensKollision(new Error("database is locked"))).toBe(false);
  });
});
