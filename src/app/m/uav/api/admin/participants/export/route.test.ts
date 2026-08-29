import { describe, it, expect, vi, beforeEach } from "vitest";
import { rmSync } from "node:fs";
import { migrateAllModules } from "@/core/bootstrap";

const DIR = "./.data/uav-admin-participants-export-test";
let gruppen: string[] | null = null;
vi.mock("@/core/auth", () => ({ auth: async () => (gruppen ? { user: { id: "sub-1", name: "Root", email: "r@x", groups: gruppen } } : null) }));

beforeEach(() => {
  rmSync(DIR, { recursive: true, force: true });
  process.env.DATA_DIR = DIR; process.env.SUITE_HOST_UAV = "uav-training.iuk-ue.de";
  delete (globalThis as { __suiteDb?: unknown }).__suiteDb;
  migrateAllModules();
  gruppen = null;
});

const get = (host = "uav-training.iuk-ue.de") => new Request("http://x/api/admin/participants/export", { headers: { host } });

describe("GET /api/admin/participants/export", () => {
  it("anonym → 403", async () => {
    gruppen = null;
    const { GET } = await import("./route");
    expect((await GET(get())).status).toBe(403);
  });

  it("mit uav-training-admin → CSV mit Überschriftszeile", async () => {
    gruppen = ["uav-training-admin"];
    const { getDb } = await import("../../../../_db/client");
    const { teilnehmerAnlegen } = await import("../../../../_lib/queries");
    teilnehmerAnlegen(getDb(), "Ada", "2026-01-01");
    const { GET } = await import("./route");
    const res = await GET(get());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="teilnehmer-uebersicht.csv"');
    const text = await res.text();
    expect(text.startsWith('﻿"Name","Beginn","Erledigt","Gesamt","Quote","LetzteAktivität","Status"\r\n')).toBe(true);
    expect(text).toContain('"Ada","2026-01-01"');
  });
});
