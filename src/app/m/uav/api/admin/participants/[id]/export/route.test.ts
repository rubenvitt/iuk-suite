import { describe, it, expect, vi, beforeEach } from "vitest";
import { rmSync } from "node:fs";
import { migrateAllModules } from "@/core/bootstrap";
import { blattnamen, mappenBytes, zeichenketten } from "@/core/export/test-mappe";

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

  it("bekannte id → Excel-Mappe, Dateiname aus Namen abgeleitet", async () => {
    const { getDb } = await import("../../../../../_db/client");
    const { teilnehmerAnlegen } = await import("../../../../../_lib/queries");
    const p = teilnehmerAnlegen(getDb(), "Ada Müller", null);
    const { GET } = await import("./route");
    const res = await GET(req(p.id), { params: Promise.resolve({ id: p.id }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    // Der Umlaut fällt wie bisher auf `_` — `dateinameSlug` ist ASCII-only,
    // damit der ANGEFÜHRTE Teil des Headers unstrittig bleibt.
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="teilnehmer-Ada_M_ller-auswertung.xlsx"');

    const texte = zeichenketten(await mappenBytes(res));
    expect(texte.slice(0, 8)).toEqual([
      "Teil", "Nummer", "Titel", "Anzahl", "Ziel", "Erledigt", "Nicht anwendbar", "Letzte Durchführung",
    ]);
  });

  /**
   * DER NAME STAND BISHER NUR IM DATEINAMEN. Wer die Datei umbenannte oder
   * mehrere nebeneinander öffnete, las acht Spalten ohne jeden Hinweis, wessen
   * Auswertung das ist. Eine CSV hatte dafür keinen Platz; eine Mappe hat ein
   * zweites Blatt.
   */
  it("trägt Teilnehmer und Kopfdaten auf einem zweiten Blatt", async () => {
    const { getDb } = await import("../../../../../_db/client");
    const { teilnehmerAnlegen } = await import("../../../../../_lib/queries");
    const p = teilnehmerAnlegen(getDb(), "Ada Müller", "2026-02-03");
    const { GET } = await import("./route");
    const bytes = await mappenBytes(
      await GET(req(p.id), { params: Promise.resolve({ id: p.id }) }),
    );

    expect(blattnamen(bytes)).toEqual(["Aufgaben", "Kopfdaten"]);
    const texte = zeichenketten(bytes);
    // Im Dateinamen steht `Ada_M_ller`; im Blatt steht der ECHTE Name.
    expect(texte).toContain("Ada Müller");
    expect(texte).toContain("Teilnehmer");
    expect(texte).toContain("2026-02-03");
  });
});
