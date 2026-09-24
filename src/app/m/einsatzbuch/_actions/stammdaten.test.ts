import { beforeEach, describe, expect, it, vi } from "vitest";
import { rmSync } from "node:fs";
import { migrateAllModules } from "@/core/bootstrap";

const DIR = "./.data/einsatzbuch-actions-stammdaten-test";
let gruppen: string[] | null = null;
let host = "einsatzbuch.localtest.me";
vi.mock("@/core/auth", () => ({ auth: async () => (gruppen ? { user: { sub: "s1", name: "Jana", groups: gruppen } } : null) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

beforeEach(() => {
  rmSync(DIR, { recursive: true, force: true });
  process.env.DATA_DIR = DIR;
  delete (globalThis as { __suiteDb?: unknown }).__suiteDb;
  migrateAllModules();
  gruppen = null;
  host = "einsatzbuch.localtest.me";
});

const FZ = { typ: "RTW", kennung: "11-83-1", ruf: "Rotkreuz Uelzen 11-83-1", standort: "Uelzen", aktiv: true };

describe("Stammdaten-Actions", () => {
  it("ohne Gruppe, als Suite-Admin oder über fremden Host: Forbidden, nichts geschrieben", async () => {
    const { fahrzeugSpeichernAction } = await import("./stammdaten");
    const { getDb } = await import("../_db/client");
    const { listeFahrzeuge } = await import("../_lib/stammdaten/daten");
    await expect(fahrzeugSpeichernAction(null, FZ)).rejects.toThrow("Forbidden");
    gruppen = ["dashboard-admins"];
    await expect(fahrzeugSpeichernAction(null, FZ)).rejects.toThrow("Forbidden");
    gruppen = ["einsatzbuch-verwaltung"]; host = "feedback.localtest.me";
    await expect(fahrzeugSpeichernAction(null, FZ)).rejects.toThrow("Forbidden");
    expect(listeFahrzeuge(getDb())).toEqual([]);
  });
  it("mit Gruppe: anlegen, doppelte Kennung als Feldfehler, ungültige Eingabe als Feldfehler", async () => {
    gruppen = ["einsatzbuch-verwaltung"];
    const { fahrzeugSpeichernAction } = await import("./stammdaten");
    const erst = await fahrzeugSpeichernAction(null, FZ);
    expect(erst.ok).toBe(true);
    expect(await fahrzeugSpeichernAction(null, FZ)).toEqual({ ok: false, fehler: "Diese Kennung gibt es schon.", feldFehler: { kennung: "Diese Kennung gibt es schon." } });
    const leer = await fahrzeugSpeichernAction(null, { ...FZ, kennung: "" });
    expect(leer.ok ? null : leer.feldFehler?.kennung).toBe("Kennung fehlt");
  });
  it("die Audit-Zeile trägt die handelnde Person", async () => {
    gruppen = ["einsatzbuch-verwaltung"];
    const { fahrzeugSpeichernAction } = await import("./stammdaten");
    const { getDb } = await import("../_db/client");
    const { sql } = await import("drizzle-orm");
    await fahrzeugSpeichernAction(null, FZ);
    const [zeile] = getDb().all(sql`SELECT actor FROM audit_outbox WHERE object_type = 'fahrzeug'`) as { actor: string }[];
    expect(JSON.parse(zeile.actor)).toMatchObject({ kind: "user", id: "s1" });
  });
  it("CSV: Vorschau schreibt nichts, Übernehmen schreibt", async () => {
    gruppen = ["einsatzbuch-verwaltung"];
    const { csvVorschauAction, csvUebernehmenAction } = await import("./stammdaten");
    const { getDb } = await import("../_db/client");
    const { listeStichworte } = await import("../_lib/stammdaten/daten");
    const text = "gruppe;name;reihenfolge\nMANV;MANV 5;1\nMANV;MANV 10;2";
    const vorschau = await csvVorschauAction("stichworte", text);
    expect(vorschau.ok && vorschau.wert.map((z) => z.klasse)).toEqual(["neu", "neu"]);
    expect(listeStichworte(getDb())).toEqual([]);
    expect(await csvUebernehmenAction("stichworte", text)).toEqual({ ok: true, wert: { neu: 2, geaendert: 0, unveraendert: 0, fehler: 0 } });
    expect(await csvVorschauAction("stichworte", "falsch")).toEqual({ ok: false, fehler: "Die Kopfzeile muss genau „gruppe;name;reihenfolge“ lauten." });
  });
  it("aktivSetzenAction mit unbekannter Art oder ID", async () => {
    gruppen = ["einsatzbuch-verwaltung"];
    const { aktivSetzenAction } = await import("./stammdaten");
    expect(await aktivSetzenAction("fahrzeuge", "nix", false)).toEqual({ ok: false, fehler: "Eintrag nicht gefunden" });
    expect(await aktivSetzenAction("unsinn" as never, "nix", false)).toEqual({ ok: false, fehler: "Unbekannte Art" });
  });
});
