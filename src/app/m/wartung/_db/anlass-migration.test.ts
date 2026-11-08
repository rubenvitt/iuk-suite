import { afterAll, describe, expect, it } from "vitest";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { openModuleDatabase } from "@/core/db";
import { START } from "../_lib/startbestand";

/**
 * `0007_anlass.sql` (IDA-369) baut `pruefart` neu. Auf ihr hängen Arten, Geräte-Abweichungen und der Verlauf; der
 * Neubau darf davon nichts verlieren und nichts ins Protokoll schreiben.
 */
const ORDNER = "src/app/m/wartung/_db/migrations";
const tmp = mkdtempSync(join(tmpdir(), "wartung-0007-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

function bisVor0007(): string {
  const ziel = join(tmp, "migrations");
  cpSync(ORDNER, ziel, { recursive: true });
  const journal = JSON.parse(readFileSync(join(ziel, "meta/_journal.json"), "utf8")) as { entries: { tag: string }[] };
  // 0007 und alles danach: der Migrator überspringt eine Migration, die älter ist als die zuletzt angewandte.
  for (const e of journal.entries) if (e.tag >= "0007") rmSync(join(ziel, `${e.tag}.sql`));
  journal.entries = journal.entries.filter((e) => e.tag < "0007");
  writeFileSync(join(ziel, "meta/_journal.json"), JSON.stringify(journal));
  return ziel;
}

describe("Migration 0007: Prüfarten auf Anlass", () => {
  it("behält Zuordnungen, Abweichungen und Verlauf", () => {
    const roh = openModuleDatabase(":memory:");
    const db = drizzle(roh);
    migrate(db, { migrationsFolder: bisVor0007() });
    const jetzt = 1793750400000;
    roh.prepare(`INSERT INTO geraet (id, gruppe_id, art_id, name, ort_art, ort, aktiv, angelegt_am, aktualisiert_am)
      VALUES ('g-it', ?, ?, 'Laptop', 'lager', 'Lager', 1, ?, ?)`).run(START.gruppe.iuk, START.art.it, jetzt, jetzt);
    roh.prepare(`INSERT INTO geraet_pruefart (geraet_id, pruefart_id, an, monate, stunden) VALUES ('g-it', ?, 1, 24, NULL)`).run(START.pruefart.dguv);
    roh.prepare(`INSERT INTO eintrag (id, geraet_id, typ, pruefart_id, titel, am, angelegt_am) VALUES ('e1', 'g-it', 'erledigt', ?, 'DGUV', '2026-01-02', ?)`)
      .run(START.pruefart.dguv, jetzt);
    const antworten = JSON.stringify([{ text: "Sichtprüfung", ok: true }]);
    roh.prepare(`INSERT INTO eintrag (id, geraet_id, typ, pruefart_id, titel, am, stunden, wer, notiz, ergebnis, antworten, maengel, angelegt_am)
      VALUES ('e0', 'g-it', 'pruefung', ?, 'Quartal', '2026-02-03', 12, 'Gerätewart', 'alles gut', 'mangel', ?, 1, ?)`).run(START.pruefart.quartal, antworten, jetzt);
    const vorher = {
      eintraege: roh.prepare("SELECT * FROM eintrag ORDER BY id").all(),
      arten: roh.prepare("SELECT * FROM art_pruefart ORDER BY art_id, pruefart_id").all(),
      katalog: roh.prepare("SELECT id, name, wer, monate, stunden, position FROM pruefart ORDER BY id").all(),
    };
    roh.prepare("DELETE FROM audit_outbox").run();

    migrate(db, { migrationsFolder: ORDNER });

    expect(roh.prepare("SELECT * FROM art_pruefart ORDER BY art_id, pruefart_id").all()).toEqual(vorher.arten);
    expect(roh.prepare("SELECT id, name, wer, monate, stunden, position FROM pruefart ORDER BY id").all()).toEqual(vorher.katalog);
    expect(roh.prepare("SELECT count(*) AS n FROM pruefart WHERE anlass IS NOT NULL").get()).toEqual({ n: 0 });
    expect(roh.prepare("SELECT geraet_id, pruefart_id, monate FROM geraet_pruefart").all()).toEqual([
      { geraet_id: "g-it", pruefart_id: START.pruefart.dguv, monate: 24 },
    ]);
    expect(roh.prepare("SELECT * FROM eintrag ORDER BY id").all()).toEqual(vorher.eintraege);
    expect(roh.prepare("SELECT name FROM sqlite_master WHERE name LIKE '\\_\\_%' ESCAPE '\\' AND name <> '__drizzle_migrations'").all()).toEqual([]);
    expect(roh.pragma("foreign_key_check")).toEqual([]);
    expect(roh.prepare("SELECT count(*) AS n FROM audit_outbox").get()).toEqual({ n: 0 });

    // Die Fremdschlüssel zeigen weiter auf die neue Tabelle: Löschen räumt die Kinder ab.
    roh.prepare("DELETE FROM pruefart WHERE id = ?").run(START.pruefart.dguv);
    expect(roh.prepare("SELECT count(*) AS n FROM geraet_pruefart").get()).toEqual({ n: 0 });
    expect(roh.prepare("SELECT pruefart_id FROM eintrag WHERE id = 'e1'").get()).toEqual({ pruefart_id: null });
    expect(roh.prepare("SELECT count(*) AS n FROM audit_outbox WHERE object_type = 'pruefart'").get()).toEqual({ n: 1 });

    // Ein Anlass hat kein Intervall und wird selbst erledigt.
    const neu = roh.prepare("INSERT INTO pruefart (id, name, wer, monate, stunden, anlass) VALUES (?, 'Kurzcheck', ?, ?, NULL, ?)");
    expect(() => neu.run("p1", "intern", null, "einsatz")).not.toThrow();
    expect(() => neu.run("p2", "intern", 12, "einsatz")).toThrow(/CHECK/);
    expect(() => neu.run("p3", "fachfirma", null, "rueckkehr")).toThrow(/CHECK/);
    expect(() => neu.run("p4", "intern", null, null)).toThrow(/CHECK/);
    expect(() => roh.prepare("INSERT INTO eintrag (id, geraet_id, typ, titel, am, angelegt_am) VALUES ('e2', 'g-it', 'einsatz', 'Eingesetzt', '2026-11-06', 1)").run()).not.toThrow();
  });
});
