import { beforeEach, describe, expect, it, vi } from "vitest";
import { rmSync } from "node:fs";
import { migrateAllModules } from "@/core/bootstrap";

const DIR = "./.data/einsatzbuch-actions-umsysteme-test";
const TOKEN = "c".repeat(64);
let gruppen: string[] | null = null;
vi.mock("@/core/auth", () => ({ auth: async () => (gruppen ? { user: { sub: "s1", name: "Verwaltung A", groups: gruppen } } : null) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "einsatzbuch.localtest.me" }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

beforeEach(() => {
  vi.resetModules();
  rmSync(DIR, { recursive: true, force: true });
  process.env.DATA_DIR = DIR;
  delete (globalThis as { __suiteDb?: unknown }).__suiteDb;
  migrateAllModules();
  gruppen = null;
});

describe("Suchlage verbinden und trennen", () => {
  it("ohne Gruppe: Forbidden", async () => {
    const { suchlageVerbindenAction, suchlageTrennenAction } = await import("./umsysteme");
    await expect(suchlageVerbindenAction({ link: `https://s.example.org/kiosk#${TOKEN}` })).rejects.toThrow("Forbidden");
    await expect(suchlageTrennenAction()).rejects.toThrow("Forbidden");
  });

  it("speichert Adresse und Token, zeigt aber nur die Adresse; Trennen entfernt beides", async () => {
    gruppen = ["einsatzbuch-nutzer"];
    const { suchlageVerbindenAction, suchlageTrennenAction } = await import("./umsysteme");
    const ergebnis = await suchlageVerbindenAction({ link: ` https://s.example.org/kiosk#${TOKEN} ` });
    expect(ergebnis.ok && ergebnis.wert.adresse).toBe("https://s.example.org");
    expect(JSON.stringify(ergebnis)).not.toContain(TOKEN);
    const { getDb } = await import("../_db/client");
    const { umsystem } = await import("../_db/schema");
    expect(getDb().select().from(umsystem).all()).toMatchObject([{ system: "suchlage", token: TOKEN, aktualisiertVon: "Verwaltung A" }]);
    expect(await suchlageTrennenAction()).toEqual({ ok: true, wert: null });
    expect(getDb().select().from(umsystem).all()).toEqual([]);
  });

  it("ein anderer Link ist ein Feldfehler", async () => {
    gruppen = ["einsatzbuch-nutzer"];
    const { suchlageVerbindenAction } = await import("./umsysteme");
    const ergebnis = await suchlageVerbindenAction({ link: "https://s.example.org/karte" });
    expect(ergebnis.ok ? null : ergebnis.feldFehler?.link).toBe("Das ist kein Großbild-Link aus Suchlage.");
  });

  it("ein http-Link ist ein Feldfehler, denn das Token ginge im Klartext mit", async () => {
    gruppen = ["einsatzbuch-nutzer"];
    const { suchlageVerbindenAction } = await import("./umsysteme");
    const ergebnis = await suchlageVerbindenAction({ link: `http://s.example.org/kiosk#${TOKEN}` });
    expect(ergebnis.ok ? null : ergebnis.feldFehler?.link).toBe("Der Großbild-Link muss mit https:// beginnen.");
  });
});
