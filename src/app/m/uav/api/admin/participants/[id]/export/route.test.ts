import { describe, it, expect, vi, beforeEach } from "vitest";
import { rmSync } from "node:fs";
import { migrateAllModules } from "@/core/bootstrap";

const DIR = "./.data/uav-admin-participant-detail-export-test";
let gruppen: string[] | null = null;
vi.mock("@/core/auth", () => ({ auth: async () => (gruppen ? { user: { id: "sub-1", name: "Root", email: "r@x", groups: gruppen } } : null) }));

beforeEach(() => {
  rmSync(DIR, { recursive: true, force: true });
  process.env.DATA_DIR = DIR; process.env.SUITE_HOST_UAV = "uav-training.iuk-ue.de";
  delete (globalThis as { __suiteDb?: unknown }).__suiteDb;
  migrateAllModules();
  gruppen = ["uav-training-admin"];
});

const req = (id: string) =>
  new Request(`http://x/api/admin/participants/${id}/export`, { headers: { host: "uav-training.iuk-ue.de" } });

describe("GET /api/admin/participants/[id]/export", () => {
  it("anonym → 403", async () => {
    gruppen = null;
    const { GET } = await import("./route");
    expect((await GET(req("xyz"), { params: Promise.resolve({ id: "xyz" }) })).status).toBe(403);
  });

  it("unbekannte id → 404", async () => {
    const { GET } = await import("./route");
    const res = await GET(req("xyz"), { params: Promise.resolve({ id: "xyz" }) });
    expect(res.status).toBe(404);
  });

  it("bekannte id → CSV, Dateiname aus Namen abgeleitet", async () => {
    const { getDb } = await import("../../../../../_db/client");
    const { teilnehmerAnlegen } = await import("../../../../../_lib/queries");
    const p = teilnehmerAnlegen(getDb(), "Ada Müller", null);
    const { GET } = await import("./route");
    const res = await GET(req(p.id), { params: Promise.resolve({ id: p.id }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="teilnehmer-Ada_M_ller-auswertung.csv"');
    // `res.text()` streicht das BOM spec-konform (WHATWG) — der Vertrag ist der
    // Byte-Rumpf, deshalb hier mit `ignoreBOM` decodieren statt `.text()`.
    const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(await res.arrayBuffer());
    expect(text.startsWith('﻿"Teil","Nummer","Titel","Anzahl","Ziel","Erledigt","NichtAnwendbar","LetzteDurchführung"\r\n')).toBe(true);
  });
});
