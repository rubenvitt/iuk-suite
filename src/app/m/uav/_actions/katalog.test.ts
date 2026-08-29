import { describe, it, expect, vi, beforeEach } from "vitest";
import { rmSync } from "node:fs";
import { migrateAllModules } from "@/core/bootstrap";
import { NotFound } from "../_lib/queries";

const DIR = "./.data/uav-actions-katalog-test";
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

const EINGABE = {
  teil: 1 as const,
  nummer: "1.1",
  titel: "Vorflugkontrolle",
  lernziel: "",
  schritte: [],
  durchfuehrungshinweise: [],
  sicherheitshinweise: [],
  zielanzahlDefault: 1,
  aktiv: true,
  bildUrl: null,
};

describe("aufgabeAnlegenAction", () => {
  it("ohne Gruppe wirft Forbidden, BEVOR etwas geschrieben wurde", async () => {
    const { aufgabeAnlegenAction } = await import("./katalog");
    const { getDb } = await import("../_db/client");
    const { alleTasks } = await import("../_lib/queries");
    await expect(aufgabeAnlegenAction(EINGABE)).rejects.toThrow("Forbidden");
    expect(alleTasks(getDb(), true)).toEqual([]);
  });

  it("mit uav-training-admin legt an", async () => {
    gruppen = ["uav-training-admin"];
    const { aufgabeAnlegenAction } = await import("./katalog");
    const aufgabe = await aufgabeAnlegenAction(EINGABE);
    expect(aufgabe.titel).toBe("Vorflugkontrolle");
    expect(aufgabe.teil).toBe(1);
  });

  it("bildUrl wird getrimmt, ein leerer String wird zu null", async () => {
    gruppen = ["uav-training-admin"];
    const { aufgabeAnlegenAction } = await import("./katalog");
    const mitLeerzeichen = await aufgabeAnlegenAction({ ...EINGABE, nummer: "1.2", bildUrl: "  /bild.webp  " });
    expect(mitLeerzeichen.bildUrl).toBe("/bild.webp");
    const mitLeerstring = await aufgabeAnlegenAction({ ...EINGABE, nummer: "1.3", bildUrl: "   " });
    expect(mitLeerstring.bildUrl).toBeNull();
  });

  it("ungültige Eingabe (leerer Titel) wirft", async () => {
    gruppen = ["uav-training-admin"];
    const { aufgabeAnlegenAction } = await import("./katalog");
    await expect(aufgabeAnlegenAction({ ...EINGABE, titel: "" })).rejects.toThrow();
  });
});

describe("aufgabeAendernAction", () => {
  it("ohne Gruppe wirft Forbidden", async () => {
    const { aufgabeAendernAction } = await import("./katalog");
    await expect(aufgabeAendernAction("irgendeine-id", { titel: "X" })).rejects.toThrow("Forbidden");
  });

  it("ändert Felder eines vorhandenen Eintrags", async () => {
    gruppen = ["uav-training-admin"];
    const { aufgabeAnlegenAction, aufgabeAendernAction } = await import("./katalog");
    const angelegt = await aufgabeAnlegenAction(EINGABE);
    const geaendert = await aufgabeAendernAction(angelegt.id, { titel: "Neuer Titel", aktiv: false });
    expect(geaendert.titel).toBe("Neuer Titel");
    expect(geaendert.aktiv).toBe(false);
  });

  it("unbekannte id wirft NotFound", async () => {
    gruppen = ["uav-training-admin"];
    const { aufgabeAendernAction } = await import("./katalog");
    await expect(aufgabeAendernAction("unbekannt", { titel: "X" })).rejects.toThrow(NotFound);
  });
});

describe("aufgabeLoeschenAction", () => {
  it("ohne Gruppe wirft Forbidden", async () => {
    const { aufgabeLoeschenAction } = await import("./katalog");
    await expect(aufgabeLoeschenAction("irgendeine-id")).rejects.toThrow("Forbidden");
  });

  it("löscht einen vorhandenen Eintrag", async () => {
    gruppen = ["uav-training-admin"];
    const { aufgabeAnlegenAction, aufgabeLoeschenAction } = await import("./katalog");
    const { getDb } = await import("../_db/client");
    const { taskById } = await import("../_lib/queries");
    const angelegt = await aufgabeAnlegenAction(EINGABE);
    await aufgabeLoeschenAction(angelegt.id);
    expect(taskById(getDb(), angelegt.id)).toBeNull();
  });

  it("unbekannte id wirft NotFound", async () => {
    gruppen = ["uav-training-admin"];
    const { aufgabeLoeschenAction } = await import("./katalog");
    await expect(aufgabeLoeschenAction("unbekannt")).rejects.toThrow(NotFound);
  });
});

describe("aufgabenSortierenAction", () => {
  it("ohne Gruppe wirft Forbidden, die Reihenfolge bleibt unverändert", async () => {
    gruppen = ["uav-training-admin"];
    const { aufgabeAnlegenAction } = await import("./katalog");
    const a = await aufgabeAnlegenAction(EINGABE);
    const b = await aufgabeAnlegenAction({ ...EINGABE, nummer: "1.2" });
    gruppen = null;
    const { aufgabenSortierenAction } = await import("./katalog");
    await expect(aufgabenSortierenAction([b.id, a.id])).rejects.toThrow("Forbidden");
    const { getDb } = await import("../_db/client");
    const { alleTasks } = await import("../_lib/queries");
    expect(alleTasks(getDb(), true).map((t) => t.id)).toEqual([a.id, b.id]);
  });

  it("schreibt die übergebene Reihenfolge als Positionen", async () => {
    gruppen = ["uav-training-admin"];
    const { aufgabeAnlegenAction, aufgabenSortierenAction } = await import("./katalog");
    const a = await aufgabeAnlegenAction(EINGABE);
    const b = await aufgabeAnlegenAction({ ...EINGABE, nummer: "1.2" });
    await aufgabenSortierenAction([b.id, a.id]);
    const { getDb } = await import("../_db/client");
    const { alleTasks } = await import("../_lib/queries");
    expect(alleTasks(getDb(), true).map((t) => t.id)).toEqual([b.id, a.id]);
  });
});
