import { beforeEach, describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync, rmSync } from "node:fs";
import { migrateAllModules } from "@/core/bootstrap";

const DIR = "./.data/kommplan-actions-plan-test";
let gruppen: string[] | null = null;
vi.mock("@/core/auth", () => ({ auth: async () => (gruppen ? { user: { id: "u1", name: "Jana", groups: gruppen } } : null) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "kommplan.localtest.me" }) }));

beforeEach(() => {
  rmSync(DIR, { recursive: true, force: true });
  process.env.DATA_DIR = DIR;
  delete (globalThis as { __suiteDb?: unknown }).__suiteDb;
  migrateAllModules();
  gruppen = null;
});

const ANGABEN = { titel: "Übung", typ: "kommunikationsplan", anlass: "", datum: "2026-09-30" };

describe("Plan-Actions", () => {
  it("ohne Admin-Gruppe: Forbidden, auch mit Zugangsgruppe", async () => {
    const { legePlanAnAction, speichereInhaltAction } = await import("./plan");
    gruppen = ["iuk-kommplan"];
    await expect(legePlanAnAction(ANGABEN)).rejects.toThrow("Forbidden");
    await expect(speichereInhaltAction({ id: "x", version: 1, inhalt: {} })).rejects.toThrow("Forbidden");
    const { ladeStandAction, speichereAngabenAction } = await import("./plan");
    await expect(ladeStandAction("x")).rejects.toThrow("Forbidden");
    await expect(speichereAngabenAction({ id: "x", version: 1, angaben: ANGABEN })).rejects.toThrow("Forbidden");
    const { ladeZeichenAction } = await import("./zeichen");
    await expect(ladeZeichenAction(["rezept:F.2.3"])).rejects.toThrow("Forbidden");
  });
  it("jede exportierte Action prüft als ERSTE Anweisung den Bearbeitungs-Riegel (per POST direkt erreichbar)", () => {
    for (const datei of readdirSync("src/app/m/kommplan/_actions").filter((d) => d.endsWith(".ts") && !d.endsWith(".test.ts"))) {
      const quelle = readFileSync(`src/app/m/kommplan/_actions/${datei}`, "utf8");
      const actions = [...quelle.matchAll(/export async function (\w+)\([^)]*\)[^{]*\{\n\s*(.*)/g)];
      expect(actions.length, datei).toBeGreaterThan(0);
      for (const [, name, erste] of actions) expect(erste, `${datei}: ${name}`).toMatch(/^(const viewer = )?await requireKommplanBearbeitenAktion\(\);$/);
      expect(quelle.match(/export /g)?.length, `${datei}: nur Actions exportieren`).toBe(actions.length);
    }
  });
  it("ladeStandAction liefert den Serverstand, unbekannt oder ungültig ist null", async () => {
    gruppen = ["iuk-kommplan-bearbeiten"];
    const { ladeStandAction, legePlanAnAction } = await import("./plan");
    const neu = await legePlanAnAction(ANGABEN);
    if (!neu.ok) throw new Error(neu.fehler);
    expect(await ladeStandAction(neu.id)).toMatchObject({ version: 1, angaben: { titel: "Übung" } });
    expect(await ladeStandAction("gibt-es-nicht")).toBeNull();
    expect(await ladeStandAction({ id: 5 })).toBeNull();
  });
  it("anlegen, speichern, Konflikt — mit Audit-Akteur aus der Sitzung", async () => {
    gruppen = ["iuk-kommplan-bearbeiten"];
    const { legePlanAnAction, speichereAngabenAction, speichereInhaltAction } = await import("./plan");
    const neu = await legePlanAnAction(ANGABEN);
    if (!neu.ok) throw new Error(neu.fehler);
    const { leererPlan } = await import("../_lib/plan/operationen");
    expect(await speichereInhaltAction({ id: neu.id, version: 1, inhalt: leererPlan() })).toMatchObject({ ok: true, version: 2 });
    expect(await speichereInhaltAction({ id: neu.id, version: 1, inhalt: leererPlan() })).toMatchObject({ ok: false, grund: "konflikt" });
    expect(await speichereAngabenAction({ id: neu.id, version: 2, angaben: { ...ANGABEN, titel: "Neu" } })).toMatchObject({ ok: true, version: 3 });
    expect(await speichereInhaltAction({ id: 5, version: "x" })).toEqual({ ok: false, grund: "ungueltig", fehler: "Ungültige Anfrage." });
    const { getDb } = await import("../_db/client");
    const { sql } = await import("drizzle-orm");
    const akteure = getDb().all(sql`SELECT DISTINCT json_extract(actor, '$.id') AS id FROM audit_outbox WHERE object_type IN ('plan','plan_bearbeitung')`) as { id: string }[];
    expect(akteure).toEqual([{ id: "u1" }]);
  });
});
