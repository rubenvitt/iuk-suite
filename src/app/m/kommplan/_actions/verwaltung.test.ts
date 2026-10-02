import { beforeEach, describe, expect, it, vi } from "vitest";
import { rmSync } from "node:fs";
import { migrateAllModules } from "@/core/bootstrap";

const DIR = "./.data/kommplan-actions-verwaltung-test";
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

describe("Actions der Planverwaltung", () => {
  it("ohne Bearbeitungsrecht: Forbidden, auch mit Zugangsgruppe", async () => {
    gruppen = ["iuk-kommplan"];
    const a = await import("./verwaltung");
    await expect(a.dupliziereAction("beispiel-openr-2022-07-01")).rejects.toThrow("Forbidden");
    await expect(a.speichereAlsVorlageAction("beispiel-openr-2022-07-01")).rejects.toThrow("Forbidden");
    await expect(a.archiviereAction("beispiel-openr-2022-07-01")).rejects.toThrow("Forbidden");
    await expect(a.stelleWiederHerAction("beispiel-openr-2022-07-01")).rejects.toThrow("Forbidden");
    await expect(a.loescheEndgueltigAction("beispiel-openr-2022-07-01")).rejects.toThrow("Forbidden");
    await expect(a.loescheOhneArchivAction("beispiel-openr-2022-07-01")).rejects.toThrow("Forbidden");
  });
  it("löschen: ohne Archiv nur frisch, endgültig nur archiviert — die Uhr ist die des Servers", async () => {
    gruppen = ["iuk-kommplan-bearbeiten"];
    const a = await import("./verwaltung");
    const { listePlaene } = await import("../_lib/plaene");
    const { getDb } = await import("../_db/client");
    const { NICHT_MEHR_FRISCH, NUR_ARCHIVIERT, PLAN_WEG } = await import("../_lib/planverwaltung");
    const kopie = await a.dupliziereAction("beispiel-openr-2022-07-01");
    if (!kopie.ok) throw new Error(kopie.fehler);
    expect(await a.loescheEndgueltigAction(kopie.id)).toEqual({ ok: false, fehler: NUR_ARCHIVIERT });
    expect(await a.loescheOhneArchivAction(kopie.id)).toEqual({ ok: true });
    expect(await a.loescheOhneArchivAction(kopie.id)).toEqual({ ok: false, fehler: PLAN_WEG });
    // Der Seed ist alt: ohne Archiv abgelehnt, nach dem Archivieren endgültig gelöscht.
    expect(await a.loescheOhneArchivAction("beispiel-openr-2022-07-01")).toEqual({ ok: false, fehler: NICHT_MEHR_FRISCH });
    expect(await a.archiviereAction("beispiel-openr-2022-07-01")).toEqual({ ok: true });
    expect(await a.loescheEndgueltigAction("beispiel-openr-2022-07-01")).toEqual({ ok: true });
    expect(listePlaene(getDb(), "archiv").map((z) => z.id)).not.toContain("beispiel-openr-2022-07-01");
    expect(await a.loescheEndgueltigAction(5)).toEqual({ ok: false, fehler: "Ungültige Anfrage." });
    expect(await a.loescheOhneArchivAction("")).toEqual({ ok: false, fehler: "Ungültige Anfrage." });
  });
  it("duplizieren, archivieren, wiederherstellen, Vorlage — ungültige Eingaben ohne Wurf", async () => {
    gruppen = ["iuk-kommplan-bearbeiten"];
    const a = await import("./verwaltung");
    const r = await a.dupliziereAction("beispiel-openr-2022-07-01");
    expect(r.ok).toBe(true);
    expect(await a.archiviereAction("beispiel-openr-2022-07-01")).toEqual({ ok: true });
    expect(await a.stelleWiederHerAction("beispiel-openr-2022-07-01")).toEqual({ ok: true });
    const v = await a.speichereAlsVorlageAction("beispiel-openr-2022-07-01");
    expect(v).toMatchObject({ ok: true, id: expect.any(String) });
    expect(await a.speichereAlsVorlageAction("beispiel-openr-2022-07-01")).toMatchObject({ ok: false, vorhanden: v.ok ? v.id : "" });
    expect(await a.speichereAlsVorlageAction("beispiel-openr-2022-07-01", true)).toMatchObject({ ok: true });
    expect(await a.speichereAlsVorlageAction("beispiel-openr-2022-07-01", "ja")).toEqual({ ok: false, fehler: "Ungültige Anfrage.", feldFehler: {} });
    expect(await a.speichereAlsVorlageAction({ id: "x" })).toEqual({ ok: false, fehler: "Ungültige Anfrage.", feldFehler: {} });
    expect(await a.archiviereAction(5)).toEqual({ ok: false, fehler: "Ungültige Anfrage." });
    expect(await a.dupliziereAction({})).toMatchObject({ ok: false });
  });
});
