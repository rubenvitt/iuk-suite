import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { describe, expect, it } from "vitest";
import { openModuleDatabase } from "@/core/db";
import * as schema from "../_db/schema";
import { funkgeraeteOrte } from "./fahrzeugbestand";

function testDb() {
  const db = drizzle(openModuleDatabase(":memory:"), { schema });
  migrate(db, { migrationsFolder: "src/app/m/radio/_db/migrations" });
  return db;
}

describe("funkgeraeteOrte — was die Funkgeräteverwaltung der Fahrzeugverwaltung herausgibt", () => {
  it("die getrimmten Orte mit Gerätezahl, ohne leere Orte und ohne ausgemusterte Geräte", () => {
    const db = testDb();
    const t = { createdAt: new Date(), updatedAt: new Date() };
    db.insert(schema.devices).values([
      { ...t, issi: "1", location: "RTW 1" },
      { ...t, issi: "2", location: " RTW 1 " },
      { ...t, issi: "3", location: "Halle", status: " Ausgemustert" },
      { ...t, issi: "4", location: "  " },
      { ...t, issi: "5", location: null },
    ]).run();
    expect(funkgeraeteOrte(db)).toEqual([{ ort: "RTW 1", geraete: 2 }]);
  });
});
