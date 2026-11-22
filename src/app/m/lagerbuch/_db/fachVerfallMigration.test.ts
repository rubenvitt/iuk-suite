import { registerAuditFunctions } from "@/core/audit/context";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import {
  copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

/**
 * IDA-412 — `0028_fach_verfall.sql` gegen eine BEFÜLLTE Datenbank. `migrations.test.ts` läuft gegen
 * eine leere, in der es nichts zu übernehmen gibt; die Zusage „nichts geht verloren" hält erst hier.
 *
 * Derselbe Umweg wie in `boxVerfallNachtrag.test.ts`: alles vor 0028 in einen Wegwerf-Ordner,
 * migrieren, den Altstand einlegen, DANN 0028 abspielen.
 */
const ORDNER = "src/app/m/lagerbuch/_db/migrations";
const ZIEL = "0028_fach_verfall";

type Journal = { version: string; dialect: string; entries: { tag: string }[] };

let aufraeumen: (() => void) | null = null;
afterEach(() => { aufraeumen?.(); aufraeumen = null; });

function standVor0028(): Database.Database {
  const tmp = mkdtempSync(join(tmpdir(), "lagerbuch-fachverfall-"));
  const teilordner = join(tmp, "migrations");
  mkdirSync(join(teilordner, "meta"), { recursive: true });
  const journal = JSON.parse(readFileSync(join(ORDNER, "meta/_journal.json"), "utf8")) as Journal;
  const ziel = journal.entries.findIndex((e) => e.tag === ZIEL);
  expect(ziel).toBeGreaterThan(0);
  journal.entries = journal.entries.slice(0, ziel);
  for (const e of journal.entries) {
    copyFileSync(join(ORDNER, `${e.tag}.sql`), join(teilordner, `${e.tag}.sql`));
  }
  expect(readdirSync(teilordner).filter((f) => f.endsWith(".sql"))).toHaveLength(ziel);
  writeFileSync(join(teilordner, "meta/_journal.json"), JSON.stringify(journal));

  const sqlite = new Database(join(tmp, "lagerbuch.db"));
  registerAuditFunctions(sqlite);
  sqlite.pragma("foreign_keys = ON");
  migrate(drizzle(sqlite), { migrationsFolder: teilordner });
  aufraeumen = () => { sqlite.close(); rmSync(tmp, { recursive: true, force: true }); };
  return sqlite;
}

function spiele0028(sqlite: Database.Database): void {
  sqlite.exec(readFileSync(join(ORDNER, `${ZIEL}.sql`), "utf8"));
}

const JETZT = 1_780_000_000;

function legeArtikel(sqlite: Database.Database, id: string): void {
  sqlite.prepare(
    "insert into artikel (id, name, einheit, fach, mindestbestand, aktiv, created_at)"
    + " values (?,?,'Stk.','A1',0,1,?)",
  ).run(id, `Artikel ${id}`, JETZT);
}

function legeEinheit(sqlite: Database.Database, id: string): void {
  sqlite.prepare(
    "insert into lagerorte (id, name, typ, aktiv, parent_id, sortierung)"
    + " values (?,?,'fahrzeug',1,NULL,0)",
  ).run(id, `Einheit ${id}`);
}

function legePosition(
  sqlite: Database.Database,
  p: { id: string; ortId: string; artikelId: string; fach: string; entfernt?: boolean },
): void {
  sqlite.prepare(
    "insert into soll_positionen (id, fahrzeug_id, fach_label, sort, artikel_id, soll, entfernt)"
    + " values (?,?,?,0,?,10,?)",
  ).run(p.id, p.ortId, p.fach, p.artikelId, p.entfernt ? 1 : 0);
}

function meldeVerfall(
  sqlite: Database.Database,
  m: { ortId: string; artikelId: string; verfall: string; erfasstAt: number; quelle: string },
): void {
  sqlite.prepare(
    "insert into lagerort_verfall (id, lagerort_id, artikel_id, verfall, erfasst_at,"
    + " quelle_typ, quelle_id) values (?,?,?,?,?,'token',?)",
  ).run(`lv-${m.ortId}-${m.artikelId}`, m.ortId, m.artikelId, m.verfall, m.erfasstAt, m.quelle);
}

const einheitszeilen = (sqlite: Database.Database) =>
  sqlite.prepare("select * from lagerort_verfall order by id").all();

type FachZeile = {
  soll_position_id: string; verfall: string; erfasst_at: number; quelle_typ: string; quelle_id: string;
};
const fachzeilen = (sqlite: Database.Database) =>
  sqlite.prepare(
    "select soll_position_id, verfall, erfasst_at, quelle_typ, quelle_id from fach_verfall"
    + " order by soll_position_id",
  ).all() as FachZeile[];

describe("0028 — der Verfall je Fach übernimmt jede bestehende Angabe", () => {
  function altstand(): Database.Database {
    const sqlite = standVor0028();
    legeArtikel(sqlite, "kompresse");
    legeArtikel(sqlite, "larynx");
    legeArtikel(sqlite, "binde");
    legeEinheit(sqlite, "rtw");
    legeEinheit(sqlite, "ktw");
    // Kompressen in ZWEI Fächern — der Fall aus der Rückmeldung.
    legePosition(sqlite, { id: "sp-k-schublade", ortId: "rtw", artikelId: "kompresse", fach: "Schublade 1" });
    legePosition(sqlite, { id: "sp-k-rucksack", ortId: "rtw", artikelId: "kompresse", fach: "Rucksack" });
    // Larynxmaske: ein aktives Fach, ein Grabstein.
    legePosition(sqlite, { id: "sp-l-aktiv", ortId: "rtw", artikelId: "larynx", fach: "Fach 3" });
    legePosition(sqlite, {
      id: "sp-l-grab", ortId: "rtw", artikelId: "larynx", fach: "Fach 9", entfernt: true,
    });
    // Mullbinde: im KTW im Soll, im RTW NICHT — die RTW-Angabe hat kein Fach.
    legePosition(sqlite, { id: "sp-b-ktw", ortId: "ktw", artikelId: "binde", fach: "Fach 1" });

    meldeVerfall(sqlite, { ortId: "rtw", artikelId: "kompresse", verfall: "2027-03", erfasstAt: JETZT, quelle: "h-1" });
    meldeVerfall(sqlite, { ortId: "rtw", artikelId: "larynx", verfall: "2026-12", erfasstAt: JETZT + 5, quelle: "h-2" });
    meldeVerfall(sqlite, { ortId: "rtw", artikelId: "binde", verfall: "2028-01", erfasstAt: JETZT + 9, quelle: "h-3" });
    return sqlite;
  }

  it("lässt `lagerort_verfall` Zeile für Zeile unverändert", () => {
    const sqlite = altstand();
    const vorher = einheitszeilen(sqlite);
    spiele0028(sqlite);
    expect(einheitszeilen(sqlite)).toEqual(vorher);
    expect(vorher).toHaveLength(3);
  });

  it("kopiert jede Angabe auf jedes aktive Fach — mit Datum, Zeitpunkt und Quelle", () => {
    const sqlite = altstand();
    spiele0028(sqlite);
    expect(fachzeilen(sqlite)).toEqual([
      { soll_position_id: "sp-k-rucksack", verfall: "2027-03", erfasst_at: JETZT, quelle_typ: "token", quelle_id: "h-1" },
      { soll_position_id: "sp-k-schublade", verfall: "2027-03", erfasst_at: JETZT, quelle_typ: "token", quelle_id: "h-1" },
      { soll_position_id: "sp-l-aktiv", verfall: "2026-12", erfasst_at: JETZT + 5, quelle_typ: "token", quelle_id: "h-2" },
    ]);
  });

  it("legt für einen Grabstein und für einen Artikel ohne Soll an der Einheit keine Fachzeile an", () => {
    const sqlite = altstand();
    spiele0028(sqlite);
    const ids = fachzeilen(sqlite).map((z) => z.soll_position_id);
    expect(ids).not.toContain("sp-l-grab");
    // Die KTW-Position hat keine eigene Angabe; die RTW-Angabe der Binde gehört nicht zu ihr.
    expect(ids).not.toContain("sp-b-ktw");
  });

  it("schreibt je übernommener Zeile einen Audit-Eintrag", () => {
    const sqlite = altstand();
    const vorher = (sqlite.prepare(
      "select count(*) as n from audit_outbox where object_type = 'fach_verfall'",
    ).get() as { n: number }).n;
    spiele0028(sqlite);
    const nachher = (sqlite.prepare(
      "select count(*) as n from audit_outbox where object_type = 'fach_verfall' and action = 'create'",
    ).get() as { n: number }).n;
    expect(nachher - vorher).toBe(3);
  });

  it("eine hart gelöschte Soll-Position nimmt ihr Fachdatum mit (ON DELETE CASCADE)", () => {
    const sqlite = altstand();
    spiele0028(sqlite);
    sqlite.prepare("delete from soll_positionen where id = ?").run("sp-k-rucksack");
    expect(fachzeilen(sqlite).map((z) => z.soll_position_id)).toEqual(["sp-k-schublade", "sp-l-aktiv"]);
  });
});
