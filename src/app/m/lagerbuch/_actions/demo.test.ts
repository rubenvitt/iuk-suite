import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { artikel, demoEinstellung, fahrzeugTemplates, templatePositionen } from "../_db/schema";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import { demoCheckDaten, demoEinstellungLesen } from "../_lib/lesepfade/demo";
import { STICHPROBE_UMFANG } from "../_lib/domain/stichprobe";

const { adminRiegel } = vi.hoisted(() => ({ adminRiegel: vi.fn<() => Promise<unknown>>() }));

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("../_lib/zugang", () => ({ requireLagerbuchAdmin: () => adminRiegel() }));
vi.mock("../_db/client", () => ({
  getDb: () => { throw new Error("getDb() im Test — jeder Aufruf übergibt t.db"); },
}));

import { setzeDemoCheck } from "./demo";

const VIEWER = { sub: "u-anna", groups: ["lagerbuch_nutzer"], name: "Anna", email: null };
const JETZT = new Date("2026-10-17T10:00:00Z");

let t: TestDb;

/** Eine Vorlage mit `n` Positionen; die ersten beiden teilen sich einen Artikel. */
function vorlage(id: string, n: number, aktiv = true): void {
  t.db.insert(fahrzeugTemplates).values({ id, name: `Vorlage ${id}`, aktiv, createdAt: JETZT }).run();
  for (let i = 0; i < n; i++) {
    const artikelId = `${id}-a${i === 1 ? 0 : i}`;
    t.db.insert(artikel).values({
      id: artikelId, name: `Artikel ${artikelId}`, einheit: "Stk.", fach: "H1", createdAt: JETZT,
    }).onConflictDoNothing().run();
    t.db.insert(templatePositionen).values({
      id: `${id}-p${i}`, templateId: id, fachLabel: `F${i % 3}`, sort: i, artikelId, soll: 2,
    }).run();
  }
}

beforeEach(() => {
  adminRiegel.mockResolvedValue(VIEWER);
  t = migrierteTestDb("lagerbuch-actions-demo-");
});

afterEach(() => {
  t.schliessen();
  vi.clearAllMocks();
});

describe("setzeDemoCheck", () => {
  it("Nicht-Admin: der Riegel wirft, nichts wird geschrieben", async () => {
    vorlage("tpl", 3);
    adminRiegel.mockRejectedValue(new Error("NEXT_NOT_FOUND"));
    await expect(setzeDemoCheck({ aktiv: true, templateId: "tpl" }, t.db)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(t.db.select().from(demoEinstellung).all()).toEqual([]);
  });

  it("schaltet ein, wechselt die Vorlage und schaltet wieder aus", async () => {
    vorlage("tpl", 3);
    vorlage("tpl2", 2);
    expect(await setzeDemoCheck({ aktiv: true, templateId: "tpl" }, t.db)).toEqual({ ok: true });
    expect(demoEinstellungLesen(t.db)).toEqual({ aktiv: true, templateId: "tpl" });
    await setzeDemoCheck({ aktiv: true, templateId: "tpl2" }, t.db);
    expect(demoEinstellungLesen(t.db)).toEqual({ aktiv: true, templateId: "tpl2" });
    await setzeDemoCheck({ aktiv: false, templateId: "tpl2" }, t.db);
    expect(demoEinstellungLesen(t.db)).toEqual({ aktiv: false, templateId: "tpl2" });
    expect(t.db.select().from(demoEinstellung).all()).toHaveLength(1);
  });

  it("weigert sich einzuschalten ohne aktive Vorlage mit Positionen", async () => {
    vorlage("leer", 0);
    vorlage("alt", 2, false);
    for (const templateId of [null, "gibt-es-nicht", "leer", "alt"]) {
      const erg = await setzeDemoCheck({ aktiv: true, templateId }, t.db);
      expect(erg.ok, String(templateId)).toBe(false);
    }
    expect(demoEinstellungLesen(t.db).aktiv).toBe(false);
  });

  it("Löschen einer Vorlage scheitert nicht am Schalter (kein Fremdschlüssel), die Demo ist danach aus", async () => {
    vorlage("tpl", 2);
    await setzeDemoCheck({ aktiv: true, templateId: "tpl" }, t.db);
    t.db.delete(templatePositionen).run();
    t.db.delete(fahrzeugTemplates).run();
    expect(demoCheckDaten(t.db, JETZT)).toBeNull();
  });
});

describe("demoCheckDaten — die Stichprobe aus der Vorlage", () => {
  it("zieht höchstens den Umfang plus Artikelgeschwister, immer ganze Artikel", async () => {
    vorlage("gross", 30);
    await setzeDemoCheck({ aktiv: true, templateId: "gross" }, t.db);
    const daten = demoCheckDaten(t.db, JETZT)!;
    const gezogen = Object.keys(daten.stichprobe);
    expect(gezogen.length).toBeGreaterThanOrEqual(STICHPROBE_UMFANG);
    expect(gezogen.length).toBeLessThanOrEqual(STICHPROBE_UMFANG + 1);
    expect(gezogen.length).toBeLessThan(daten.soll.length);
    // p0 und p1 teilen sich einen Artikel: entweder beide oder keine.
    expect(gezogen.includes("gross-p0")).toBe(gezogen.includes("gross-p1"));
    expect(new Set(Object.values(daten.stichprobe))).toEqual(new Set(["Noch nie gezählt"]));
    // Handlager erfunden: Summe des Solls je Artikel.
    expect(daten.soll.find((p) => p.id === "gross-p0")!.handlagerBestand).toBe(4);
    // Dieselbe Stichprobe beim Neuladen am selben Tag.
    expect(demoCheckDaten(t.db, JETZT)!.stichprobe).toEqual(daten.stichprobe);
  });
});
