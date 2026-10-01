import { beforeEach, describe, expect, it, vi } from "vitest";
import { rmSync } from "node:fs";
import { migrateAllModules } from "@/core/bootstrap";

const DIR = "./.data/kommplan-actions-briefkopf-test";
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

describe("Briefkopf-Actions", () => {
  it("ohne Bearbeitungsrecht: Forbidden", async () => {
    const { entferneLogoAction, speichereOrganisationAction } = await import("./briefkopf");
    gruppen = ["iuk-kommplan"];
    await expect(speichereOrganisationAction({ organisation: "X" })).rejects.toThrow("Forbidden");
    await expect(entferneLogoAction()).rejects.toThrow("Forbidden");
  });
  it("Organisation setzen und Logo entfernen", async () => {
    gruppen = ["iuk-kommplan-bearbeiten"];
    const { entferneLogoAction, speichereOrganisationAction } = await import("./briefkopf");
    expect(await speichereOrganisationAction({ organisation: "Muster" })).toEqual({ ok: true });
    expect(await speichereOrganisationAction("kaputt")).toMatchObject({ ok: false });
    expect(await entferneLogoAction()).toEqual({ ok: true });
    const { ladeBriefkopf } = await import("../_lib/briefkopf");
    const { getDb } = await import("../_db/client");
    expect(ladeBriefkopf(getDb())).toMatchObject({ organisation: "Muster", logo: null, aktualisiertVon: "Jana" });
  });
});
