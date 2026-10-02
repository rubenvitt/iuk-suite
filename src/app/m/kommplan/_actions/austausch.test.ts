import { beforeEach, describe, expect, it, vi } from "vitest";
import { rmSync } from "node:fs";
import { migrateAllModules } from "@/core/bootstrap";

const DIR = "./.data/kommplan-actions-austausch-test";
let nutzer: { id: string; name: string; groups: string[] } | null = null;
vi.mock("@/core/auth", () => ({ auth: async () => (nutzer ? { user: nutzer } : null) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "kommplan.localtest.me" }) }));
beforeEach(async () => {
  rmSync(DIR, { recursive: true, force: true });
  process.env.DATA_DIR = DIR;
  delete (globalThis as { __suiteDb?: unknown }).__suiteDb;
  migrateAllModules();
  const { seedLokalKommplan } = await import("../_lib/seedLokal");
  await seedLokalKommplan((await import("../_db/client")).getDb());
  nutzer = null;
});
const OPENR = "beispiel-openr-2022-07-01";

describe("Actions Export und Import", () => {
  it("anonym: Forbidden", async () => {
    const a = await import("./austausch");
    await expect(a.exportierePlanAction(OPENR)).rejects.toThrow("Forbidden");
    await expect(a.importierePlanAction({})).rejects.toThrow("Forbidden");
  });
  it("Export eines sichtbaren Plans, Import als eigener privater Plan — den ein anderer nicht exportiert", async () => {
    const a = await import("./austausch");
    nutzer = { id: "u-anna", name: "Anna", groups: ["iuk-kommplan"] };
    const e = await a.exportierePlanAction(OPENR);
    if (!e.ok) throw new Error(e.fehler);
    expect(e.dateiname).toMatch(/\.kommplan\.json$/);
    const i = await a.importierePlanAction(JSON.parse(JSON.stringify(e.datei)));
    if (!i.ok) throw new Error(i.fehler);
    expect(await a.exportierePlanAction(i.id)).toMatchObject({ ok: true });
    nutzer = { id: "u-admin", name: "Admin", groups: ["iuk-kommplan-bearbeiten"] };
    expect(await a.exportierePlanAction(i.id)).toMatchObject({ ok: false });
    expect(await a.exportierePlanAction({ id: 1 })).toMatchObject({ ok: false });
    expect(await a.importierePlanAction("kein Plan")).toMatchObject({ ok: false });
  });
});
