import { describe, it, expect, vi, beforeEach } from "vitest";
import { rmSync } from "node:fs";
import { migrateAllModules } from "@/core/bootstrap";
import { blattnamen, mappenBytes, zeichenketten } from "@/core/export/test-mappe";

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

  /** Seit DRK-186 eine Excel-Mappe statt einer CSV. Der äußere Pfad bleibt
   *  derselbe; nur Medientyp und Dateiname wechseln. */
  it("mit uav-training-admin → Excel-Mappe mit Überschriftszeile", async () => {
    gruppen = ["uav-training-admin"];
    const { getDb } = await import("../../../../_db/client");
    const { teilnehmerAnlegen } = await import("../../../../_lib/queries");
    teilnehmerAnlegen(getDb(), "Ada", "2026-01-01");
    const { GET } = await import("./route");
    const res = await GET(get());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="teilnehmer-uebersicht.xlsx"');

    const bytes = await mappenBytes(res);
    expect(blattnamen(bytes)).toEqual(["Teilnehmer"]);
    const texte = zeichenketten(bytes);
    // Die sieben Köpfe in dieser Reihenfolge — `Quote %` statt `Quote`, weil
    // die Zelle jetzt eine Zahl trägt (siehe `_lib/export.ts`).
    expect(texte.slice(0, 7)).toEqual([
      "Name", "Beginn", "Erledigt", "Gesamt", "Quote %", "Letzte Aktivität", "Status",
    ]);
    expect(texte).toContain("Ada");
    expect(texte).toContain("2026-01-01");
  });

  /**
   * DER GRUND FÜR DEN WECHSEL, GEMESSEN: `erledigt` und `gesamt` standen im
   * CSV-Weg als `String(...)` in der Datei — in einer Kalkulation weder
   * summierbar noch richtig sortierbar („10" vor „9"). Sie dürfen deshalb
   * NICHT in der Zeichenkettentabelle auftauchen.
   */
  it("schreibt die Zahlenspalten als Zahlen, nicht als Text", async () => {
    gruppen = ["uav-training-admin"];
    const { getDb } = await import("../../../../_db/client");
    const { teilnehmerAnlegen } = await import("../../../../_lib/queries");
    teilnehmerAnlegen(getDb(), "Ada", "2026-01-01");
    const { GET } = await import("./route");
    const texte = zeichenketten(await mappenBytes(await GET(get())));
    expect(texte).not.toContain("0");
    expect(texte.some((t) => /^\d+%$/.test(t))).toBe(false);
  });
});
