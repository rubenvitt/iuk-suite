import { beforeEach, describe, expect, it, vi } from "vitest";
import { rmSync } from "node:fs";
import { migrateAllModules } from "@/core/bootstrap";

/**
 * Die Rechte an den Lagekarten-Actions: nur Modul-Admins auf dem Host des Moduls. Die Fachlogik prüft
 * `_lib/lagekarte.test.ts`; hier geht es um den Riegel davor und darum, dass die Eingabe geprüft ankommt.
 */
const DIR = "./.data/lagemonitor-actions-test";
let nutzer: { id: string; name: string; groups: string[] } | null = null;
let host = "lagemonitor.localtest.me";
vi.mock("@/core/auth", () => ({ auth: async () => (nutzer ? { user: nutzer } : null) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// Das Zeichen gehört kommplan; hier reicht, dass es eins gibt.
vi.mock("@/app/m/kommplan/_lib/bereitstellung", () => ({
  zeichenAuswahl: () => [{ schluessel: "rezept:F.3.15", titel: "Unterkunft" }],
  zeichenAlsSvg: (k: readonly string[]) => Object.fromEntries(k.filter((x) => x === "rezept:F.3.15").map((x) => [x, "<svg/>"])),
}));

beforeEach(() => {
  rmSync(DIR, { recursive: true, force: true });
  process.env.DATA_DIR = DIR;
  delete (globalThis as { __suiteDb?: unknown }).__suiteDb;
  migrateAllModules();
  nutzer = null;
  host = "lagemonitor.localtest.me";
});

const ADMIN = { id: "u-admin", name: "Verwaltung Test", groups: ["lagemonitor-admin"] };
const PUNKT = { art: "punkt", name: "Wache Nord", zeichen: "rezept:F.3.15", breite: 52.97, laenge: 10.56 };
const FLAECHE = { art: "flaeche", name: "Bereitstellungsraum", farbe: "ocker", ring: [[10.5, 52.9], [10.6, 52.9], [10.6, 53.0]] };

describe("Lagekarten-Actions", () => {
  it("ohne Sitzung, ohne Admin-Gruppe oder auf fremdem Host: Forbidden, und nichts ist angelegt", async () => {
    const a = await import("./verwaltung");
    await expect(a.lagekarteAnlegenAction(PUNKT)).rejects.toThrow("Forbidden");
    nutzer = { ...ADMIN, groups: ["lagemonitor-nutzer", "fahrzeuge-admin"] };
    await expect(a.lagekarteAnlegenAction(PUNKT)).rejects.toThrow("Forbidden");
    await expect(a.lagekarteAendernAction("lk-x", PUNKT)).rejects.toThrow("Forbidden");
    await expect(a.lagekarteSchaltenAction("lk-x", false)).rejects.toThrow("Forbidden");
    await expect(a.lagekarteLoeschenAction("lk-x")).rejects.toThrow("Forbidden");
    nutzer = ADMIN;
    host = "kommplan.localtest.me";
    await expect(a.lagekarteAnlegenAction(PUNKT)).rejects.toThrow("Forbidden");
    const { getDb } = await import("../_db/client");
    const { listeLagekarte } = await import("../_lib/lagekarte");
    expect(listeLagekarte(getDb()).liste).toEqual([]);
  });

  it("Admin legt an, ändert, schaltet und löscht; ungültige Eingabe kommt am Feld an", async () => {
    nutzer = ADMIN;
    const a = await import("./verwaltung");
    const falsch = await a.lagekarteAnlegenAction({ ...FLAECHE, ring: FLAECHE.ring.slice(0, 2) });
    expect(falsch).toMatchObject({ ok: false, feldFehler: { ring: "Eine Fläche braucht mindestens 3 Eckpunkte." } });
    const r = await a.lagekarteAnlegenAction(PUNKT);
    if (!r.ok) throw new Error(r.fehler);
    expect(await a.lagekarteAendernAction(r.wert.id, FLAECHE)).toEqual({ ok: true });
    expect(await a.lagekarteSchaltenAction(r.wert.id, false)).toEqual({ ok: true });
    expect(await a.lagekarteSchaltenAction(r.wert.id, "nein")).toMatchObject({ ok: false });
    const { getDb } = await import("../_db/client");
    const { listeLagekarte } = await import("../_lib/lagekarte");
    expect(listeLagekarte(getDb()).liste).toEqual([expect.objectContaining({ id: r.wert.id, art: "flaeche", aufKarte: false, geaendertVon: "Verwaltung Test" })]);
    expect(await a.lagekarteLoeschenAction(r.wert.id)).toEqual({ ok: true });
    expect(await a.lagekarteLoeschenAction(r.wert.id)).toEqual({ ok: false, fehler: "Dieses Objekt gibt es nicht mehr." });
    expect(await a.lagekarteAnlegenAction({ ...PUNKT, zeichen: "unbekannt" })).toEqual({ ok: false, fehler: "Dieses Zeichen gibt es nicht (mehr)." });
  });
});
