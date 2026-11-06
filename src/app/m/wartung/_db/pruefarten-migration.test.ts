import { afterAll, describe, expect, it } from "vitest";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { openModuleDatabase } from "@/core/db";
import { START } from "../_lib/startbestand";

/**
 * `0006_pruefarten.sql` (IDA-368) auf einem Bestand von davor: der Verlauf zeigt danach auf die zusammengelegte
 * Prüfart, und wer vorher ein anderes Intervall hatte (IT: DGUV alle 24 Monate), behält es am Gerät.
 */
const ORDNER = "src/app/m/wartung/_db/migrations";
const tmp = mkdtempSync(join(tmpdir(), "wartung-0006-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

/** Die alten, je Art angelegten Fristen aus `0001_startbestand.sql`. */
const ALT = {
  akkuQuartal: "a86ee46d-168e-53ff-a314-a46631adf341",
  itQuartal: "173cf362-ee70-5303-a056-698f8cf7e603",
  itDguv: "1709a29b-2902-5f22-a055-9a0f61ba8805",
};

function bisVor0006(): string {
  const ziel = join(tmp, "migrations");
  cpSync(ORDNER, ziel, { recursive: true });
  rmSync(join(ziel, "0006_pruefarten.sql"));
  const journal = JSON.parse(readFileSync(join(ziel, "meta/_journal.json"), "utf8")) as { entries: { tag: string }[] };
  journal.entries = journal.entries.filter((e) => e.tag !== "0006_pruefarten");
  writeFileSync(join(ziel, "meta/_journal.json"), JSON.stringify(journal));
  return ziel;
}

describe("Migration 0006: Fristen werden Prüfarten", () => {
  it("übernimmt Verlauf und abweichende Intervalle", () => {
    const roh = openModuleDatabase(":memory:");
    const db = drizzle(roh);
    migrate(db, { migrationsFolder: bisVor0006() });
    const jetzt = 1793750400000;
    roh.prepare(`INSERT INTO geraet (id, gruppe_id, art_id, name, ort_art, ort, aktiv, angelegt_am, aktualisiert_am)
      VALUES (?, ?, ?, ?, 'lager', 'Lager', 1, ?, ?)`).run("g-it", START.gruppe.iuk, START.art.it, "Laptop", jetzt, jetzt);
    roh.prepare(`INSERT INTO geraet (id, gruppe_id, art_id, name, ort_art, ort, aktiv, angelegt_am, aktualisiert_am)
      VALUES (?, ?, ?, ?, 'lager', 'Lager', 1, ?, ?)`).run("g-akku", START.gruppe.iuk, START.art.akku, "Powerstation", jetzt, jetzt);
    const eintrag = roh.prepare(`INSERT INTO eintrag (id, geraet_id, typ, frist_id, titel, am, angelegt_am) VALUES (?, ?, 'erledigt', ?, ?, '2026-01-02', ?)`);
    eintrag.run("e1", "g-it", ALT.itDguv, "Elektroprüfung (DGUV V3)", jetzt);
    eintrag.run("e2", "g-it", ALT.itQuartal, "Quartalsprüfung", jetzt);
    eintrag.run("e3", "g-akku", ALT.akkuQuartal, "Quartalsprüfung", jetzt);

    migrate(db, { migrationsFolder: ORDNER });

    expect(roh.prepare("SELECT id, pruefart_id FROM eintrag ORDER BY id").all()).toEqual([
      { id: "e1", pruefart_id: START.pruefart.dguv },
      { id: "e2", pruefart_id: START.pruefart.quartal },
      { id: "e3", pruefart_id: START.pruefart.quartal },
    ]);
    expect(roh.prepare("SELECT geraet_id, pruefart_id, an, monate, stunden FROM geraet_pruefart").all()).toEqual([
      { geraet_id: "g-it", pruefart_id: START.pruefart.dguv, an: 1, monate: 24, stunden: null },
    ]);
    expect(roh.prepare("SELECT count(*) AS n FROM pruefart").get()).toEqual({ n: 4 });
    expect(roh.prepare("SELECT name FROM sqlite_master WHERE name IN ('frist', '__frist_zu_pruefart')").all()).toEqual([]);
    expect(roh.pragma("foreign_key_check")).toEqual([]);
    // Die Umstellung selbst steht nicht als Änderung im Protokoll.
    expect(roh.prepare("SELECT count(*) AS n FROM audit_outbox WHERE object_type IN ('pruefart','art_pruefart','geraet_pruefart')").get()).toEqual({ n: 0 });
  });
});
