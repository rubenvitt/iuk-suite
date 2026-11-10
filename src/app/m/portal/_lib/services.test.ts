import { registerAuditFunctions } from "@/core/audit/context";
import { it, expect, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import { mkdirSync, rmSync } from "node:fs";
import * as schema from "@/app/m/portal/_db/schema";

const TEST_DATA_DIR = "./.data/portal-test";

// getDb() liest DATA_DIR; hier isolierte Datei setzen und Migrationen anwenden.
// Verzeichnis vor jedem Lauf frisch anlegen, damit der Test bei wiederholtem
// `pnpm test` idempotent bleibt (sonst UNIQUE-constraint auf slug beim 2. Lauf).
beforeEach(() => {
  rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  process.env.DATA_DIR = TEST_DATA_DIR;
});

it("create + list visible", async () => {
  // Migration einmalig anwenden (Task-11-Step-4 erzeugt ./src/app/m/portal/_db/migrations)
  // better-sqlite3 legt anders als openModuleDatabase() das Verzeichnis nicht selbst an.
  mkdirSync(TEST_DATA_DIR, { recursive: true });
  const db = drizzle(registerAuditFunctions(new Database(`${TEST_DATA_DIR}/portal.db`)), { schema });
  migrate(db, { migrationsFolder: "./src/app/m/portal/_db/migrations" });
  const { createService, getVisibleServicesForUser } = await import("@/app/m/portal/_lib/services");
  await createService({ slug: "wiki", name: "Wiki", url: "https://wiki", isPublic: true });
  const visible = await getVisibleServicesForUser([]);
  expect(visible.map((s) => s.slug)).toContain("wiki");
});

/** DIE KENNUNG KOMMT AUS DEM NAMEN (IDA-391). */
it("leitet die Kennung aus dem Namen ab: Umlaute ausgeschrieben, klein, Bindestriche", async () => {
  const { kennungAusName } = await import("@/app/m/portal/_lib/services");
  expect(kennungAusName("Größe & Übersicht")).toBe("groesse-uebersicht");
  expect(kennungAusName("  Ärzte-Wiki (intern) ")).toBe("aerzte-wiki-intern");
  expect(kennungAusName("Café")).toBe("cafe");
  expect(kennungAusName("!!!")).toBe("dienst");
});

it("hängt bei einer vergebenen Kennung einen Zähler an", async () => {
  const { freieKennung } = await import("@/app/m/portal/_lib/services");
  expect(freieKennung("wiki", new Set())).toBe("wiki");
  expect(freieKennung("wiki", new Set(["wiki", "wiki-2"]))).toBe("wiki-3");
});

it("legt zwei gleichnamige Dienste mit verschiedenen Kennungen an", async () => {
  mkdirSync(TEST_DATA_DIR, { recursive: true });
  const db = drizzle(registerAuditFunctions(new Database(`${TEST_DATA_DIR}/portal.db`)), { schema });
  migrate(db, { migrationsFolder: "./src/app/m/portal/_db/migrations" });
  const { legeDienstAn, getAllServices } = await import("@/app/m/portal/_lib/services");
  // Eigener Name: `getDb()` hält die Verbindung über die Tests dieser Datei, „wiki" steht schon.
  await legeDienstAn({ name: "Ärzte Liste", url: "https://a.example", isPublic: true });
  await legeDienstAn({ name: "Ärzte Liste", url: "https://b.example", isPublic: true });
  const kennungen = (await getAllServices()).map((s) => s.slug).filter((k) => k.startsWith("aerzte"));
  expect(kennungen.sort()).toEqual(["aerzte-liste", "aerzte-liste-2"]);
});

it("liest das Dienstformular und lehnt fehlende oder fremde Adressen ab", async () => {
  const { dienstFelderAusFormular } = await import("@/app/m/portal/_lib/services");
  const fd = (e: Record<string, string>) => {
    const d = new FormData();
    for (const [k, v] of Object.entries(e)) d.set(k, v);
    return d;
  };
  expect(
    dienstFelderAusFormular(fd({ name: "A", url: "https://a.example", category: " ", openInNewTab: "on", iconUrl: "https://a.example/i.png" })),
  ).toEqual({ name: "A", url: "https://a.example", description: "", category: null, iconUrl: "https://a.example/i.png", openInNewTab: true });
  expect(() => dienstFelderAusFormular(fd({ name: "", url: "https://a.example" }))).toThrow(/Name/);
  expect(() => dienstFelderAusFormular(fd({ name: "A", url: "ftp://a.example" }))).toThrow(/http/);
  expect(() => dienstFelderAusFormular(fd({ name: "A", url: "https://a.example", iconUrl: "data:x" }))).toThrow(/Bildadresse/);
});
