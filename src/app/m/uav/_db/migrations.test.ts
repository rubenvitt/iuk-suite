import { it, expect, beforeAll, afterAll } from "vitest";
import Database from "better-sqlite3";
import { rmSync } from "node:fs";
import { migrateAllModules } from "@/core/bootstrap";

const DIR = "./.data/uav-migrations-test";
beforeAll(() => { rmSync(DIR, { recursive: true, force: true }); process.env.DATA_DIR = DIR; migrateAllModules(); });
afterAll(() => rmSync(DIR, { recursive: true, force: true }));

function spalten(tabelle: string): string[] {
  const db = new Database(`${DIR}/uav.db`, { readonly: true });
  try {
    return (db.prepare(`PRAGMA table_info(${tabelle})`).all() as { name: string }[]).map((c) => c.name);
  } finally { db.close(); }
}

// Reihenfolge und Namen aus uav-praxis/server/db/schema.sql — der Import kopiert per
// INSERT ... SELECT * und der Paritätscheck hasht Zeilen; jede Abweichung wäre ein roter Cutover.
it.each([
  ["participants", ["id", "name", "login_code", "aktiv", "beginn", "created_at", "last_seen"]],
  ["tasks", ["id", "teil", "nummer", "titel", "lernziel", "schritte", "durchfuehrungshinweise",
             "sicherheitshinweise", "zielanzahl_default", "sort_order", "aktiv", "bild", "updated_at"]],
  ["executions", ["id", "participant_id", "task_id", "datum", "drohnensteuerer", "luftraumbeobachter",
                  "created_at", "deleted_at"]],
  ["task_status", ["participant_id", "task_id", "zielanzahl", "nicht_anwendbar", "updated_at"]],
  ["sessions", ["token", "kind", "subject_id", "created_at", "expires_at"]],
])("%s trägt die Alt-Spalten in Alt-Reihenfolge", (tabelle, erwartet) => {
  expect(spalten(tabelle)).toEqual(erwartet);
});

it("hat weder admins noch oidc_states", () => {
  const db = new Database(`${DIR}/uav.db`, { readonly: true });
  const namen = (db.prepare("select name from sqlite_master where type='table'").all() as { name: string }[]).map((r) => r.name);
  db.close();
  expect(namen).not.toContain("admins");
  expect(namen).not.toContain("oidc_states");
});
