import { beforeEach, describe, expect, it, vi } from "vitest";
import { rmSync } from "node:fs";
import { migrateAllModules } from "@/core/bootstrap";

const DIR = "./.data/einsatzbuch-actions-einstellungen-test";
let gruppen: string[] | null = null;
let host = "einsatzbuch.localtest.me";
vi.mock("@/core/auth", () => ({ auth: async () => (gruppen ? { user: { sub: "s1", name: "Jana", groups: gruppen } } : null) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

beforeEach(() => {
  rmSync(DIR, { recursive: true, force: true });
  process.env.DATA_DIR = DIR;
  delete (globalThis as { __suiteDb?: unknown }).__suiteDb;
  migrateAllModules();
  gruppen = null;
  host = "einsatzbuch.localtest.me";
});

describe("einstellungenSpeichernAction", () => {
  it("ohne Gruppe: Forbidden", async () => {
    const { einstellungenSpeichernAction } = await import("./einstellungen");
    await expect(einstellungenSpeichernAction({ fristMinuten: 30, besatzung: false, bereitschaft: "X" })).rejects.toThrow("Forbidden");
  });
  it("mit Gruppe: speichert und liefert die gelesenen Einstellungen", async () => {
    gruppen = ["einsatzbuch-verwaltung"];
    const { einstellungenSpeichernAction } = await import("./einstellungen");
    const ergebnis = await einstellungenSpeichernAction({ fristMinuten: 30, besatzung: false, bereitschaft: "X" });
    expect(ergebnis).toEqual({ ok: true, wert: { fristMinuten: 30, besatzung: false, bereitschaft: "X" } });
  });
  it("ungültige Eingabe wird als Feldfehler gemeldet", async () => {
    gruppen = ["einsatzbuch-verwaltung"];
    const { einstellungenSpeichernAction } = await import("./einstellungen");
    const ergebnis = await einstellungenSpeichernAction({ fristMinuten: 121, besatzung: false, bereitschaft: "X" });
    expect(ergebnis.ok ? null : ergebnis.feldFehler?.fristMinuten).toBe("Höchstens 120 Minuten");
  });
});
