import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import { registerAuditFunctions } from "@/core/audit/context";
import * as schema from "@/app/m/portal/_db/schema";
import {
  aboVon, abosMitPush, beendeAbo, richteAboEin, setzeAuswahl, vermerkeGruppen, vermerkeWoche, wechsleThema, type PortalDb,
} from "./abos";

/* Eine frische, migrierte Datenbank im Speicher je Test — die Migration selbst ist Teil der Prüfung. */
function frisch(): PortalDb {
  const sqlite = new Database(":memory:");
  registerAuditFunctions(sqlite);
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./src/app/m/portal/_db/migrations" });
  return db as unknown as PortalDb;
}

describe("Abos für „Was steht an“", () => {
  it("einrichten legt ein Thema an, ein zweiter Aufruf kein zweites", () => {
    const db = frisch();
    const a = richteAboEin("p1", "iuk-faellig-", ["lager"], db);
    expect(a).toMatchObject({ personId: "p1", push: true, abgewaehlt: [], gruppen: ["lager"], gesendeteWoche: null });
    expect(a.thema).toMatch(/^iuk-faellig-[a-z0-9]{20}$/);
    expect(richteAboEin("p1", "iuk-faellig-", [], db).thema).toBe(a.thema);
    expect(richteAboEin("p2", "iuk-faellig-", [], db).thema).not.toBe(a.thema);
  });

  it("Auswahl, Gruppenstand und Woche landen in der Zeile der Person — nur dort", () => {
    const db = frisch();
    richteAboEin("p1", "x-", [], db);
    richteAboEin("p2", "x-", [], db);
    setzeAuswahl("p1", { push: false, abgewaehlt: ["radio:Ausleihe"] }, db);
    vermerkeGruppen(aboVon("p1", db)!, ["funk", "lager"], db);
    vermerkeWoche("p2", "2026-W45", db);
    expect(aboVon("p1", db)).toMatchObject({ push: false, abgewaehlt: ["radio:Ausleihe"], gruppen: ["funk", "lager"], gesendeteWoche: null });
    expect(aboVon("p2", db)).toMatchObject({ push: true, abgewaehlt: [], gruppen: [], gesendeteWoche: "2026-W45" });
    expect(abosMitPush(db).map((a) => a.personId)).toEqual(["p2"]);
  });

  it("neues Thema setzt die Woche zurück, beenden löscht die Zeile", () => {
    const db = frisch();
    const alt = richteAboEin("p1", "x-", [], db).thema;
    vermerkeWoche("p1", "2026-W45", db);
    wechsleThema("p1", "x-", db);
    expect(aboVon("p1", db)).toMatchObject({ gesendeteWoche: null });
    expect(aboVon("p1", db)!.thema).not.toBe(alt);
    beendeAbo("p1", db);
    expect(aboVon("p1", db)).toBeNull();
  });
});
