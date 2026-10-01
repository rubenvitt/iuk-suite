import { beforeEach, describe, expect, it, vi } from "vitest";
import { rmSync } from "node:fs";
import { migrateAllModules } from "@/core/bootstrap";

const DIR = "./.data/kommplan-actions-bibliothek-test";
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

describe("Bibliotheks-Actions", () => {
  it("ohne Bearbeitungsrecht: Forbidden — jede einzelne", async () => {
    gruppen = ["iuk-kommplan"];
    const a = await import("./bibliothek");
    await expect(a.speichereBibStelleAction({})).rejects.toThrow("Forbidden");
    await expect(a.speichereBibEinheitAction({})).rejects.toThrow("Forbidden");
    await expect(a.speichereBibVerbindungAction({})).rejects.toThrow("Forbidden");
    await expect(a.loescheBibEintragAction({})).rejects.toThrow("Forbidden");
    await expect(a.importiereBibEinheitenAction([])).rejects.toThrow("Forbidden");
    await expect(a.importiereBibVerbindungenAction([])).rejects.toThrow("Forbidden");
  });
  it("anlegen, importieren, löschen — Audit nennt die Person", async () => {
    gruppen = ["iuk-kommplan-bearbeiten"];
    const a = await import("./bibliothek");
    const s = await a.speichereBibStelleAction({ id: null, titel: "EAL Süd", zeichen: null, leiter: null, kontakte: [], notiz: null });
    if (!s.ok) throw new Error(s.fehler);
    expect(await a.importiereBibEinheitenAction([{ typ: "RTW", rufname: "RK 1", notiz: null }])).toMatchObject({ ok: true, angelegt: 1, uebersprungen: 0 });
    expect(await a.importiereBibVerbindungenAction([{ art: "tmo", bezeichnung: "R_UE_9" }])).toMatchObject({ ok: true, angelegt: 1 });
    expect(await a.loescheBibEintragAction({ art: "stelle", id: s.eintrag.id })).toEqual({ ok: true });
    const { getDb } = await import("../_db/client");
    const { sql } = await import("drizzle-orm");
    const akteure = getDb().all(sql`SELECT DISTINCT json_extract(actor, '$.id') AS id FROM audit_outbox WHERE object_type LIKE 'bib_%'`) as { id: string }[];
    expect(akteure).toEqual([{ id: "u1" }]);
  });
});
