import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { describe, expect, it } from "vitest";
import { openModuleDatabase } from "@/core/db";
import * as schema from "../_db/schema";
import { lagerbuchFahrzeuge } from "./fahrzeugbestand";

function testDb() {
  const db = drizzle(openModuleDatabase(":memory:"), { schema });
  migrate(db, { migrationsFolder: "src/app/m/lagerbuch/_db/migrations" });
  return db;
}

describe("lagerbuchFahrzeuge — was das Lagerbuch der Fahrzeugverwaltung herausgibt", () => {
  it("Fahrzeuge und nicht zugeordnete Fahrzeug-Orte, ohne Taschen und ohne Lager", () => {
    const db = testDb();
    db.insert(schema.lagerorte).values([
      { id: "a", name: "RTW 1", typ: "fahrzeug", kennung: "UE-RK 831", einheitenart: "fahrzeug" },
      { id: "b", name: "Alter Anhänger", typ: "fahrzeug", aktiv: false },
      { id: "c", name: "Notfallrucksack", typ: "fahrzeug", einheitenart: "tasche" },
      { id: "d", name: "Handlager", typ: "lager" },
    ]).run();
    expect(lagerbuchFahrzeuge(db).sort((x, y) => x.id.localeCompare(y.id))).toEqual([
      { id: "a", name: "RTW 1", kennung: "UE-RK 831", einheitenart: "fahrzeug", aktiv: true },
      { id: "b", name: "Alter Anhänger", kennung: null, einheitenart: null, aktiv: false },
    ]);
  });
});
