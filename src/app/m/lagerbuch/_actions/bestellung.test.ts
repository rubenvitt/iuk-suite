import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { artikel } from "../_db/schema";
import { migrierteTestDb, type TestDb } from "../_db/testdb";

const { revalidiert, adminRiegel } = vi.hoisted(() => ({
  revalidiert: [] as string[],
  adminRiegel: vi.fn<() => Promise<unknown>>(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (pfad: string) => { revalidiert.push(pfad); },
}));

vi.mock("../_lib/zugang", () => ({
  requireLagerbuchAdmin: () => adminRiegel(),
}));

vi.mock("../_db/client", () => ({
  getDb: () => { throw new Error("getDb() im Test — jeder Aufruf übergibt t.db"); },
}));

import { markiereBestellt } from "./bestellung";

const VIEWER = {
  sub: "u-admin",
  groups: ["lagerbuch"],
  name: "A. Verwaltung",
  email: null,
};
const ERSTELLT_AM = new Date("2025-01-02T03:04:05.000Z");
const VORHER_BESTELLT_AM = new Date("2026-06-15T10:00:00.000Z");
const BESTELLT_AM = new Date("2026-07-04T12:34:56.000Z");
const BESTELLUNG_PFAD = "/m/lagerbuch/verwaltung/bestellung";
const VERWALTUNG_PFAD = "/m/lagerbuch/verwaltung";

let t: TestDb;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(BESTELLT_AM);
  revalidiert.length = 0;
  adminRiegel.mockResolvedValue(VIEWER);
  t = migrierteTestDb("lagerbuch-actions-bestellung-");
});

afterEach(() => {
  t.schliessen();
  vi.useRealTimers();
  vi.clearAllMocks();
});

function artikelAnlegen(
  werte: Partial<typeof artikel.$inferInsert> = {},
): void {
  t.db.insert(artikel).values({
    id: "art-1",
    name: "Mullbinde",
    einheit: "Stk",
    fach: "A-01",
    mindestbestand: 7,
    aktiv: false,
    bestelltAt: VORHER_BESTELLT_AM,
    createdAt: ERSTELLT_AM,
    ...werte,
  }).run();
}

function artikelMitId(id: string) {
  return t.db.select().from(artikel).where(eq(artikel.id, id)).get();
}

function auditZeilen(): { actor: string; object_type: string }[] {
  return t.sqlite
    .prepare("SELECT actor, object_type FROM audit_outbox WHERE object_type = 'artikel'")
    .all() as { actor: string; object_type: string }[];
}

describe("markiereBestellt", () => {
  it("setzt am Zielartikel den exakt aktuellen Zeitstempel und bewahrt alle anderen Felder", async () => {
    artikelAnlegen({ bestelltAt: null });
    artikelAnlegen({
      id: "art-2",
      name: "Dreiecktuch",
      einheit: "Pkg",
      fach: "B-09",
      mindestbestand: 13,
      aktiv: true,
      bestelltAt: null,
    });
    const zielVorher = artikelMitId("art-1");
    const andererVorher = artikelMitId("art-2");

    const erg = await markiereBestellt({ artikelIds: ["art-1"], bestellt: true }, t.db);

    expect(erg).toEqual({ ok: true, wert: { betroffen: 1 } });
    expect(artikelMitId("art-1")).toEqual({
      ...zielVorher,
      bestelltAt: BESTELLT_AM,
    });
    expect(artikelMitId("art-2")).toEqual(andererVorher);
    expect(revalidiert).toEqual([BESTELLUNG_PFAD, VERWALTUNG_PFAD]);
  });

  /**
   * IDA-238 — EINE AUSWAHL IN EINER ANFRAGE. Die Auswahl darf schon markierte
   * Zeilen enthalten; deren „seit" bleibt stehen, denn erneuert wurde dort
   * nichts.
   */
  it("markiert eine Auswahl in einer Anfrage und laesst ein vorhandenes Datum stehen", async () => {
    artikelAnlegen();
    artikelAnlegen({ id: "art-2", name: "Dreiecktuch", bestelltAt: null });
    artikelAnlegen({ id: "art-3", name: "Kompresse", bestelltAt: null });

    const erg = await markiereBestellt(
      { artikelIds: ["art-1", "art-2", "art-3", "art-2", "gibt-es-nicht"], bestellt: true },
      t.db,
    );

    expect(erg).toEqual({ ok: true, wert: { betroffen: 2 } });
    expect(artikelMitId("art-1")?.bestelltAt?.getTime()).toBe(VORHER_BESTELLT_AM.getTime());
    expect(artikelMitId("art-2")?.bestelltAt?.getTime()).toBe(BESTELLT_AM.getTime());
    expect(artikelMitId("art-3")?.bestelltAt?.getTime()).toBe(BESTELLT_AM.getTime());
  });

  /**
   * DIE MARKIERUNG SCHREIBT KEINE JOURNALZEILE — belegt wird sie im Audit, und
   * zwar je Artikel, obwohl die Aenderung in EINEM `UPDATE` steht. Ein schon
   * markierter Artikel bekommt keine Zeile: an ihm hat sich nichts geaendert.
   */
  it("schreibt je geaendertem Artikel eine Auditzeile mit dem angemeldeten Konto", async () => {
    artikelAnlegen();
    artikelAnlegen({ id: "art-2", name: "Dreiecktuch", bestelltAt: null });
    artikelAnlegen({ id: "art-3", name: "Kompresse", bestelltAt: null });
    t.sqlite.exec("DELETE FROM audit_outbox");

    await markiereBestellt({ artikelIds: ["art-1", "art-2", "art-3"], bestellt: true }, t.db);

    const zeilen = auditZeilen();
    expect(zeilen).toHaveLength(2);
    for (const zeile of zeilen) {
      expect(JSON.parse(zeile.actor)).toEqual({ kind: "user", id: "u-admin", name: "A. Verwaltung" });
    }
  });

  it("nimmt die Markierung an einer Auswahl zurueck und bewahrt alle anderen Felder", async () => {
    artikelAnlegen();
    artikelAnlegen({ id: "art-2", name: "Dreiecktuch", bestelltAt: null });
    const vorher = artikelMitId("art-1");
    const andererVorher = artikelMitId("art-2");
    expect(vorher?.bestelltAt?.getTime()).toBe(VORHER_BESTELLT_AM.getTime());

    const erg = await markiereBestellt({ artikelIds: ["art-1", "art-2"], bestellt: false }, t.db);

    expect(erg).toEqual({ ok: true, wert: { betroffen: 1 } });
    expect(artikelMitId("art-1")).toEqual({ ...vorher, bestelltAt: null });
    expect(artikelMitId("art-2")).toEqual(andererVorher);
    expect(revalidiert).toEqual([BESTELLUNG_PFAD, VERWALTUNG_PFAD]);
  });

  it.each([
    { artikelIds: [], bestellt: true },
    { artikelIds: [""], bestellt: true },
    { artikelIds: ["art-1"], bestellt: "ja" },
    // Die alte Einzelform kommt nicht mehr an — ein veralteter Client bekommt
    // eine Abweisung statt einer stillen Teilwirkung.
    { artikelId: "art-1", bestellt: true },
  ])("weist ungültige Eingaben ohne Änderung und Revalidierung zurück (%j)", async (eingabe) => {
    artikelAnlegen();
    const vorher = artikelMitId("art-1");

    const erg = await markiereBestellt(eingabe, t.db);

    expect(erg).toEqual({ ok: false, fehler: "Ungültige Eingabe." });
    expect(artikelMitId("art-1")).toEqual(vorher);
    expect(revalidiert).toEqual([]);
  });

  it("lässt bei ungültiger Eingabe zuerst den Admin-Riegel entscheiden", async () => {
    artikelAnlegen();
    const vorher = artikelMitId("art-1");
    const verweigert = new Error("Kein Lagerbuch-Zugang");
    adminRiegel.mockRejectedValueOnce(verweigert);

    await expect(markiereBestellt({ artikelIds: [], bestellt: true }, t.db))
      .rejects.toBe(verweigert);

    expect(adminRiegel).toHaveBeenCalledTimes(1);
    expect(artikelMitId("art-1")).toEqual(vorher);
    expect(revalidiert).toEqual([]);
  });

  it("weist einen Nicht-Admin ab, bevor eine gültige Auswahl etwas ändert", async () => {
    artikelAnlegen({ bestelltAt: null });
    const verweigert = new Error("Kein Lagerbuch-Admin");
    adminRiegel.mockRejectedValueOnce(verweigert);

    await expect(markiereBestellt({ artikelIds: ["art-1"], bestellt: true }, t.db))
      .rejects.toBe(verweigert);

    expect(artikelMitId("art-1")?.bestelltAt).toBeNull();
    expect(revalidiert).toEqual([]);
  });
});

