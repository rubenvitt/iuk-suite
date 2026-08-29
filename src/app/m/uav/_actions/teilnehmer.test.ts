import { describe, it, expect, vi, beforeEach } from "vitest";
import { rmSync } from "node:fs";
import { migrateAllModules } from "@/core/bootstrap";

// Vorbild `api/admin/participants/route.test.ts`: eigenes DATA_DIR, echte
// Migration, mutierbare `gruppen` statt jeder Test-Datei ihre eigene DB-Mock-
// Fassung erfindet — Server Actions gaten genau wie die Route Handler über
// `_lib/requireUavAdmin.ts`.
const DIR = "./.data/uav-actions-teilnehmer-test";
let gruppen: string[] | null = null;
vi.mock("@/core/auth", () => ({ auth: async () => (gruppen ? { user: { id: "sub-1", name: "Root", email: "r@x", groups: gruppen } } : null) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

beforeEach(() => {
  rmSync(DIR, { recursive: true, force: true });
  process.env.DATA_DIR = DIR;
  process.env.SUITE_HOST_UAV = "uav-training.iuk-ue.de";
  delete (globalThis as { __suiteDb?: unknown }).__suiteDb;
  migrateAllModules();
  gruppen = null;
});

describe("teilnehmerAnlegenAction", () => {
  it("ohne Gruppe wirft Forbidden, BEVOR etwas geschrieben wurde", async () => {
    const { teilnehmerAnlegenAction } = await import("./teilnehmer");
    const { getDb } = await import("../_db/client");
    const { alleTeilnehmer } = await import("../_lib/queries");
    const fd = new FormData();
    fd.set("name", "Bruno");
    await expect(teilnehmerAnlegenAction(fd)).rejects.toThrow("Forbidden");
    expect(alleTeilnehmer(getDb())).toEqual([]);
  });

  it("mit uav-training-admin legt an, der Code hat 8 Zeichen", async () => {
    gruppen = ["uav-training-admin"];
    const { teilnehmerAnlegenAction } = await import("./teilnehmer");
    const fd = new FormData();
    fd.set("name", "Bruno");
    fd.set("beginn", "2026-08-01");
    const teilnehmer = await teilnehmerAnlegenAction(fd);
    expect(teilnehmer.name).toBe("Bruno");
    expect(teilnehmer.beginn).toBe("2026-08-01");
    expect(teilnehmer.loginCode).toHaveLength(8);
  });

  it("Suite-Admin (dashboard-admins) darf ebenfalls anlegen", async () => {
    gruppen = ["dashboard-admins"];
    const { teilnehmerAnlegenAction } = await import("./teilnehmer");
    const fd = new FormData();
    fd.set("name", "Carla");
    const teilnehmer = await teilnehmerAnlegenAction(fd);
    expect(teilnehmer.name).toBe("Carla");
  });

  it("leerer Name wirft (Zod)", async () => {
    gruppen = ["uav-training-admin"];
    const { teilnehmerAnlegenAction } = await import("./teilnehmer");
    const fd = new FormData();
    fd.set("name", "");
    await expect(teilnehmerAnlegenAction(fd)).rejects.toThrow();
  });
});

describe("teilnehmerAendernAction", () => {
  it("ohne Gruppe wirft Forbidden", async () => {
    const { teilnehmerAendernAction } = await import("./teilnehmer");
    await expect(teilnehmerAendernAction("irgendeine-id", { name: "X" })).rejects.toThrow("Forbidden");
  });

  it("ändert Name, Beginn und Status", async () => {
    gruppen = ["uav-training-admin"];
    const { teilnehmerAnlegenAction, teilnehmerAendernAction } = await import("./teilnehmer");
    const fd = new FormData();
    fd.set("name", "Dora");
    const angelegt = await teilnehmerAnlegenAction(fd);
    const geaendert = await teilnehmerAendernAction(angelegt.id, { name: "Doris", aktiv: false, beginn: "2026-01-01" });
    expect(geaendert.name).toBe("Doris");
    expect(geaendert.aktiv).toBe(false);
    expect(geaendert.beginn).toBe("2026-01-01");
    expect(geaendert.loginCode).toBe(angelegt.loginCode);
  });

  it("unbekannte id wirft NotFound", async () => {
    gruppen = ["uav-training-admin"];
    const { teilnehmerAendernAction } = await import("./teilnehmer");
    await expect(teilnehmerAendernAction("unbekannt", { name: "X" })).rejects.toThrow();
  });
});

describe("codeNeuAction", () => {
  it("ohne Gruppe wirft Forbidden, der Code bleibt unverändert", async () => {
    gruppen = ["uav-training-admin"];
    const { teilnehmerAnlegenAction } = await import("./teilnehmer");
    const fd = new FormData();
    fd.set("name", "Elke");
    const angelegt = await teilnehmerAnlegenAction(fd);
    gruppen = null;
    const { codeNeuAction } = await import("./teilnehmer");
    await expect(codeNeuAction(angelegt.id)).rejects.toThrow("Forbidden");
    const { getDb } = await import("../_db/client");
    const { teilnehmerById } = await import("../_lib/queries");
    expect(teilnehmerById(getDb(), angelegt.id)!.loginCode).toBe(angelegt.loginCode);
  });

  it("erzeugt einen neuen, 8-stelligen Code", async () => {
    gruppen = ["uav-training-admin"];
    const { teilnehmerAnlegenAction, codeNeuAction } = await import("./teilnehmer");
    const fd = new FormData();
    fd.set("name", "Frieda");
    const angelegt = await teilnehmerAnlegenAction(fd);
    const erneuert = await codeNeuAction(angelegt.id);
    expect(erneuert.loginCode).toHaveLength(8);
    expect(erneuert.loginCode).not.toBe(angelegt.loginCode);
  });
});

describe("teilnehmerLoeschenAction", () => {
  it("ohne Gruppe wirft Forbidden", async () => {
    const { teilnehmerLoeschenAction } = await import("./teilnehmer");
    await expect(teilnehmerLoeschenAction("irgendeine-id")).rejects.toThrow("Forbidden");
  });

  it("löscht einen vorhandenen Teilnehmer", async () => {
    gruppen = ["uav-training-admin"];
    const { teilnehmerAnlegenAction, teilnehmerLoeschenAction } = await import("./teilnehmer");
    const fd = new FormData();
    fd.set("name", "Gustav");
    const angelegt = await teilnehmerAnlegenAction(fd);
    await teilnehmerLoeschenAction(angelegt.id);
    const { getDb } = await import("../_db/client");
    const { teilnehmerById } = await import("../_lib/queries");
    expect(teilnehmerById(getDb(), angelegt.id)).toBeNull();
  });

  it("unbekannte id wirft NotFound", async () => {
    gruppen = ["uav-training-admin"];
    const { teilnehmerLoeschenAction } = await import("./teilnehmer");
    await expect(teilnehmerLoeschenAction("unbekannt")).rejects.toThrow();
  });
});
