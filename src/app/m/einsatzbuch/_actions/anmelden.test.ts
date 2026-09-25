import { beforeEach, describe, expect, it, vi } from "vitest";
import { rmSync } from "node:fs";
import { migrateAllModules } from "@/core/bootstrap";

const DIR = "./.data/einsatzbuch-actions-anmelden-test";
let gruppen: string[] | null = null;
let host = "einsatzbuch.localtest.me";
vi.mock("@/core/auth", () => ({ auth: async () => (gruppen ? { user: { id: "s1", name: "Jana Albers", groups: gruppen } } : null) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host }) }));
const nav = vi.hoisted(() => ({ redirect: vi.fn((ziel: string) => { throw new Error(`NEXT_REDIRECT ${ziel}`); }) }));
vi.mock("next/navigation", () => ({ redirect: nav.redirect }));

const GUELTIG = { port: "54321", state: "a".repeat(22), challenge: "b".repeat(43), name: "Leitstelle" };

function formular(felder: Partial<typeof GUELTIG> = {}): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries({ ...GUELTIG, ...felder })) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  rmSync(DIR, { recursive: true, force: true });
  process.env.DATA_DIR = DIR;
  delete (globalThis as { __suiteDb?: unknown }).__suiteDb;
  migrateAllModules();
  gruppen = null;
  host = "einsatzbuch.localtest.me";
  nav.redirect.mockClear();
});

describe("ersetzenBestaetigenAction", () => {
  it("ohne Gruppe: Forbidden", async () => {
    const { ersetzenBestaetigenAction } = await import("./anmelden");
    await expect(ersetzenBestaetigenAction(formular())).rejects.toThrow("Forbidden");
  });

  it("mit fremdem Host: Forbidden", async () => {
    gruppen = ["einsatzbuch-verwaltung"];
    host = "feedback.localtest.me";
    const { ersetzenBestaetigenAction } = await import("./anmelden");
    await expect(ersetzenBestaetigenAction(formular())).rejects.toThrow("Forbidden");
  });

  it("ungültige Formularwerte werfen, statt einen Code zu erzeugen", async () => {
    gruppen = ["einsatzbuch-verwaltung"];
    const { ersetzenBestaetigenAction } = await import("./anmelden");
    await expect(ersetzenBestaetigenAction(formular({ state: "zu-kurz" }))).rejects.toThrow("Anmeldung ungültig.");
    expect(nav.redirect).not.toHaveBeenCalled();
  });

  it("mit Gruppe: ein Code mit ersetzen=1 steht in der DB, redirect zeigt auf 127.0.0.1", async () => {
    gruppen = ["einsatzbuch-verwaltung"];
    const { ersetzenBestaetigenAction } = await import("./anmelden");
    await expect(ersetzenBestaetigenAction(formular())).rejects.toThrow(
      new RegExp(`^NEXT_REDIRECT http://127\\.0\\.0\\.1:54321/rueckruf\\?code=.+&state=${GUELTIG.state}$`),
    );
    expect(nav.redirect).toHaveBeenCalledTimes(1);

    const { getDb } = await import("../_db/client");
    const { einmalcode } = await import("../_db/schema");
    const zeile = getDb().select().from(einmalcode).get();
    expect(zeile).toMatchObject({ einrichtungArt: "echt", rechnerName: "Leitstelle", ersetzen: true, sub: "s1", name: "Jana Albers" });
  });
});
