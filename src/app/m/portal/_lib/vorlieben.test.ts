import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import { registerAuditFunctions } from "@/core/audit/context";
import * as schema from "@/app/m/portal/_db/schema";
import {
  ANGEHEFTET_HOECHSTENS,
  ZULETZT_MERKEN,
  istSchluessel,
  merkeAufruf,
  mitAngeheftet,
  nachBesuch,
  setzeAngeheftet,
  vorliebenVon,
  type PortalDb,
} from "./vorlieben";

/* Frische, migrierte Datenbank im Speicher — die Migration ist Teil der Prüfung. */
function frisch(): PortalDb {
  const sqlite = new Database(":memory:");
  registerAuditFunctions(sqlite);
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./src/app/m/portal/_db/migrations" });
  return db as unknown as PortalDb;
}

describe("Vorlieben im Launcher (IDA-338)", () => {
  it("nachBesuch stellt nach vorn, ohne Doppel, und hält die Länge", () => {
    expect(nachBesuch(["a", "b", "c"], "b")).toEqual(["b", "a", "c"]);
    const lang = Array.from({ length: ZULETZT_MERKEN }, (_, i) => `m${i}`);
    expect(nachBesuch(lang, "neu")).toHaveLength(ZULETZT_MERKEN);
    expect(nachBesuch(lang, "neu")[0]).toBe("neu");
  });

  it("mitAngeheftet hängt hinten an, löst ohne die Reihenfolge zu stören, und deckelt", () => {
    expect(mitAngeheftet(["a", "b"], "c", true)).toEqual(["a", "b", "c"]);
    expect(mitAngeheftet(["a", "b", "c"], "b", false)).toEqual(["a", "c"]);
    expect(mitAngeheftet(["a", "b"], "a", true)).toEqual(["b", "a"]);
    const voll = Array.from({ length: ANGEHEFTET_HOECHSTENS }, (_, i) => `k${i}`);
    expect(mitAngeheftet(voll, "x", true)).toHaveLength(ANGEHEFTET_HOECHSTENS);
  });

  it("nimmt nur Schlüssel in der Form der Launcher-Einträge", () => {
    expect(istSchluessel("lagerbuch")).toBe(true);
    expect(istSchluessel("dienst:Ab_3-x")).toBe(true);
    expect(istSchluessel("radio:verwaltung")).toBe(true);
    expect(istSchluessel("")).toBe(false);
    expect(istSchluessel("a b")).toBe(false);
    expect(istSchluessel(42)).toBe(false);
    expect(istSchluessel("x".repeat(200))).toBe(false);
  });

  it("ohne Zeile sind beide Listen leer", () => {
    expect(vorliebenVon("p1", frisch())).toEqual({ angeheftet: [], zuletzt: [] });
  });

  it("anheften und merken teilen sich die Zeile, ohne einander zu überschreiben", () => {
    const db = frisch();
    setzeAngeheftet("p1", "lagerbuch", true, db);
    merkeAufruf("p1", "helfer", db);
    merkeAufruf("p1", "kommplan", db);
    setzeAngeheftet("p1", "dienst:x", true, db);
    expect(vorliebenVon("p1", db)).toEqual({ angeheftet: ["lagerbuch", "dienst:x"], zuletzt: ["kommplan", "helfer"] });
    expect(vorliebenVon("p2", db)).toEqual({ angeheftet: [], zuletzt: [] });
  });

  it("schreibt nicht, wenn derselbe Eintrag schon vorn steht", () => {
    const db = frisch();
    merkeAufruf("p1", "helfer", db);
    const vorher = db.select().from(schema.launcherVorlieben).get()!.aktualisiertAm;
    merkeAufruf("p1", "helfer", db);
    expect(db.select().from(schema.launcherVorlieben).get()!.aktualisiertAm).toEqual(vorher);
  });
});
