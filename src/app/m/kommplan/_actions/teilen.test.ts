import { beforeEach, describe, expect, it, vi } from "vitest";
import { rmSync } from "node:fs";
import { migrateAllModules } from "@/core/bootstrap";

const DIR = "./.data/kommplan-actions-teilen-test";
let nutzer: { id: string; name: string; groups: string[] } | null = null;
vi.mock("@/core/auth", () => ({ auth: async () => (nutzer ? { user: nutzer } : null) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "kommplan.localtest.me" }) }));
const verzeichnis = vi.hoisted(() => ({ search: vi.fn(), list: vi.fn() }));
vi.mock("@/core/directory", () => ({ getDirectory: () => verzeichnis }));
beforeEach(() => {
  rmSync(DIR, { recursive: true, force: true });
  process.env.DATA_DIR = DIR;
  delete (globalThis as { __suiteDb?: unknown }).__suiteDb;
  migrateAllModules();
  nutzer = null;
  verzeichnis.search.mockReset().mockResolvedValue({ status: "unconfigured", people: [] });
  verzeichnis.list.mockReset().mockResolvedValue({ status: "unconfigured", people: [] });
});
const ANNA = { id: "u-anna", name: "Anna", groups: ["iuk-kommplan"] };
const BODO = { id: "u-bodo", name: "Bodo", groups: ["iuk-kommplan"] };

async function annasPlan(): Promise<string> {
  nutzer = ANNA;
  const { legePlanAnAction } = await import("./plan");
  const r = await legePlanAnAction({ titel: "Annas", typ: "kommunikationsplan", anlass: "", datum: null });
  if (!r.ok) throw new Error(r.fehler);
  return r.id;
}

describe("Actions Teilen und Einladen", () => {
  it("anonym und ohne Zugangsgruppe: Forbidden", async () => {
    const a = await import("./teilen");
    await expect(a.teileInOrganisationAction("x")).rejects.toThrow("Forbidden");
    nutzer = { ...BODO, groups: ["andere"] };
    await expect(a.suchePersonenAction("x", "bo")).rejects.toThrow("Forbidden");
  });
  it("teilen, suchen, einladen, entfernen — die Suche fragt das Verzeichnis erst nach der Rechteprüfung", async () => {
    const id = await annasPlan();
    const { getDb } = await import("../_db/client");
    const { merkePerson } = await import("../_lib/mitglieder");
    merkePerson(getDb(), "u-bodo", "Bodo");
    const a = await import("./teilen");
    nutzer = BODO;
    expect(await a.suchePersonenAction(id, "bo")).toEqual([]);
    expect(verzeichnis.search).not.toHaveBeenCalled();
    expect(await a.ladeMitgliederAction(id)).toBeNull();
    nutzer = ANNA;
    expect(await a.teileInOrganisationAction(id)).toEqual({ ok: true, mitglieder: [] });
    expect(await a.suchePersonenAction(id, "b")).toEqual([]);
    expect(verzeichnis.search).not.toHaveBeenCalled();
    expect(await a.suchePersonenAction(id, "bo")).toEqual([{ nutzer: "u-bodo", name: "Bodo", email: null }]);
    expect(verzeichnis.search).toHaveBeenCalledWith("bo", 20);
    expect(await a.ladeEinAction({ planId: id, nutzer: "u-bodo" })).toMatchObject({ ok: true, mitglieder: [{ nutzer: "u-bodo" }] });
    expect(await a.ladeMitgliederAction(id)).toMatchObject([{ nutzer: "u-bodo", name: "Bodo" }]);
    // Bodo bearbeitet jetzt, verwaltet aber nicht.
    nutzer = BODO;
    const { speichereAngabenAction } = await import("./plan");
    expect(await speichereAngabenAction({ id, version: 1, angaben: { titel: "Von Bodo", typ: "kommunikationsplan", anlass: "", datum: null } })).toMatchObject({ ok: true });
    expect(await a.entferneMitgliedAction({ planId: id, nutzer: "u-bodo" })).toMatchObject({ ok: false });
    nutzer = ANNA;
    expect(await a.entferneMitgliedAction({ planId: id, nutzer: "u-bodo" })).toEqual({ ok: true, mitglieder: [] });
  });
  it("ein Verzeichnis, das wirft, nimmt keine Action mit", async () => {
    const id = await annasPlan();
    const a = await import("./teilen");
    await a.teileInOrganisationAction(id);
    verzeichnis.search.mockRejectedValue(new Error("weg"));
    verzeichnis.list.mockRejectedValue(new Error("weg"));
    expect(await a.suchePersonenAction(id, "ca")).toEqual([]);
    expect(await a.ladeEinAction({ planId: id, nutzer: "u-carla" })).toMatchObject({ ok: false, fehler: expect.stringContaining("unbekannt") });
  });
});
