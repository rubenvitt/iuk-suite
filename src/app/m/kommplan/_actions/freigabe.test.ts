import { beforeEach, describe, expect, it, vi } from "vitest";
import { rmSync } from "node:fs";
import { migrateAllModules } from "@/core/bootstrap";

const DIR = "./.data/kommplan-actions-freigabe-test";
let gruppen: string[] | null = null;
vi.mock("@/core/auth", () => ({ auth: async () => (gruppen ? { user: { id: "u1", name: "Jana", groups: gruppen } } : null) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "kommplan.localtest.me" }) }));
beforeEach(async () => {
  rmSync(DIR, { recursive: true, force: true });
  process.env.DATA_DIR = DIR;
  delete (globalThis as { __suiteDb?: unknown }).__suiteDb;
  migrateAllModules();
  const { seedLokalKommplan } = await import("../_lib/seedLokal");
  await seedLokalKommplan((await import("../_db/client")).getDb());
  gruppen = null;
});
const OPENR = "beispiel-openr-2022-07-01";

describe("Actions der Token-Links", () => {
  it("ohne Bearbeitungsrecht: Forbidden — auch mit Zugangsgruppe, auch anonym", async () => {
    const a = await import("./freigabe");
    await expect(a.stelleFreigabeAusAction({ planId: OPENR, dauer: "7d", notiz: "" })).rejects.toThrow("Forbidden");
    gruppen = ["iuk-kommplan"];
    await expect(a.stelleFreigabeAusAction({ planId: OPENR, dauer: "7d", notiz: "" })).rejects.toThrow("Forbidden");
    await expect(a.widerrufeFreigabeAction({ planId: OPENR, freigabeId: "x" })).rejects.toThrow("Forbidden");
  });
  it("ausstellen und widerrufen mit Audit-Akteur aus der Sitzung", async () => {
    gruppen = ["iuk-kommplan-bearbeiten"];
    const a = await import("./freigabe");
    const r = await a.stelleFreigabeAusAction({ planId: OPENR, dauer: "24h", notiz: "Leitstelle" });
    if (!r.ok) throw new Error(r.fehler);
    expect(r.freigaben[0]).toMatchObject({ id: r.neu, notiz: "Leitstelle", erstelltVon: "Jana", status: "gueltig" });
    const w = await a.widerrufeFreigabeAction({ planId: OPENR, freigabeId: r.neu });
    expect(w).toMatchObject({ ok: true, freigaben: [{ status: "widerrufen" }] });
    const { getDb } = await import("../_db/client");
    const { sql } = await import("drizzle-orm");
    const akteure = getDb().all(sql`SELECT DISTINCT json_extract(actor, '$.id') AS id FROM audit_outbox WHERE object_type = 'plan_freigabe'`) as { id: string }[];
    expect(akteure).toEqual([{ id: "u1" }]);
  });
  it("Unsinn wird abgewiesen, nicht geworfen", async () => {
    gruppen = ["iuk-kommplan-bearbeiten"];
    const a = await import("./freigabe");
    expect(await a.stelleFreigabeAusAction("x")).toMatchObject({ ok: false });
    expect(await a.widerrufeFreigabeAction({ planId: 5 })).toEqual({ ok: false, fehler: "Ungültige Anfrage.", feldFehler: {} });
  });
});
