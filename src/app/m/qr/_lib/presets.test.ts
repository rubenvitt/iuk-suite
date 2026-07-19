import { describe, it, expect, beforeEach } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";

const DIR = "./.data/qr-test";

// Der Code unter Test wird in jedem Test dynamisch importiert, damit er die
// hier gesetzte DATA_DIR sieht.
//
// mkdirSync ist noetig, weil better-sqlite3 - anders als openModuleDatabase() -
// das Verzeichnis nicht selbst anlegt; nach dem rmSync gaebe es sonst
// SQLITE_CANTOPEN statt eines Testergebnisses.
//
// Der Cache in globalThis.__suiteDb muss mit weg: getModuleDb() haelt die
// Verbindung global fest, und nach dem rmSync zeigte sie auf die geloeschte
// Datei weiter. Die Tests saehen dann die Daten ihrer Vorgaenger.
beforeEach(() => {
  rmSync(DIR, { recursive: true, force: true });
  mkdirSync(DIR, { recursive: true });
  process.env.DATA_DIR = DIR;
  const sqlite = new Database(`${DIR}/qr.db`);
  migrate(drizzle(sqlite), { migrationsFolder: "src/app/m/qr/_db/migrations" });
  sqlite.close();
  delete (globalThis as { __suiteDb?: unknown }).__suiteDb;
});

describe("presets", () => {
  it("legt ein Preset an und vergibt einen Slug aus dem Label", async () => {
    const { createPreset, listPresets } = await import("@/app/m/qr/_lib/presets");
    const p = await createPreset(
      { label: "Übung Größe", kind: "url", value: "https://drk.de" },
      "user-1",
    );
    expect(p.id).toBe("uebung-groesse");
    expect(await listPresets()).toHaveLength(1);
  });

  it("kollidierende Labels bekommen -2", async () => {
    const { createPreset } = await import("@/app/m/qr/_lib/presets");
    await createPreset({ label: "Test", kind: "url", value: "a" }, "u");
    const second = await createPreset({ label: "Test", kind: "url", value: "b" }, "u");
    expect(second.id).toBe("test-2");
  });

  it("value wird JSON-kodiert gespeichert und wieder geparst", async () => {
    const { createPreset, listPresets } = await import("@/app/m/qr/_lib/presets");
    await createPreset(
      { label: "W", kind: "wifi", value: { ssid: "S", password: "p", encryption: "WPA" } },
      "u",
    );
    const [p] = await listPresets();
    expect(p.kind).toBe("wifi");
    expect(p.value).toEqual({ ssid: "S", password: "p", encryption: "WPA" });
  });

  it("sortiert nach sort_order, dann label", async () => {
    const { createPreset, listPresets, reorderPresets } = await import("@/app/m/qr/_lib/presets");
    await createPreset({ label: "A", kind: "url", value: "a" }, "u");
    await createPreset({ label: "B", kind: "url", value: "b" }, "u");
    await reorderPresets(["b", "a"]);
    expect((await listPresets()).map((p) => p.id)).toEqual(["b", "a"]);
  });

  it("update ändert Werte und updated_by, id bleibt", async () => {
    const { createPreset, updatePreset } = await import("@/app/m/qr/_lib/presets");
    const p = await createPreset({ label: "Alt", kind: "url", value: "a" }, "u1");
    const updated = await updatePreset(p.id, { label: "Neu", kind: "url", value: "b" }, "u2");
    expect(updated?.id).toBe(p.id);
    expect(updated?.label).toBe("Neu");
  });

  it("update auf unbekannte id liefert null statt zu werfen", async () => {
    const { updatePreset } = await import("@/app/m/qr/_lib/presets");
    expect(
      await updatePreset("gibtsnicht", { label: "X", kind: "url", value: "a" }, "u"),
    ).toBeNull();
  });

  // uniqueSlug haengt `-2` an, ohne die Laenge zu pruefen. Bei einer Basis, die
  // slugify bereits auf die vollen 60 Zeichen bringt, entstuende eine 62 Zeichen
  // lange ID - die validatePresetInput ablehnt. Das Preset liesse sich dann
  // anlegen, aber nie wieder bearbeiten.
  it("kuerzt die Basis, damit auch eine kollidierende ID gueltig bleibt", async () => {
    const { createPreset } = await import("@/app/m/qr/_lib/presets");
    const { validatePresetInput } = await import("@/app/m/qr/_lib/validator");
    const label = "a".repeat(60);

    await createPreset({ label, kind: "url", value: "a" }, "u");
    const second = await createPreset({ label, kind: "url", value: "b" }, "u");

    expect(validatePresetInput({ id: second.id, label, kind: "url", value: "b" }).ok).toBe(true);
  });

  it("delete meldet, ob etwas gelöscht wurde", async () => {
    const { createPreset, deletePreset } = await import("@/app/m/qr/_lib/presets");
    const p = await createPreset({ label: "Weg", kind: "url", value: "a" }, "u");
    expect(await deletePreset(p.id)).toBe(true);
    expect(await deletePreset(p.id)).toBe(false);
  });
});
