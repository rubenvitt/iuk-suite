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

describe("markiereBestellt", () => {
  it("setzt am Zielartikel den exakt aktuellen Zeitstempel und bewahrt alle anderen Felder", async () => {
    artikelAnlegen();
    artikelAnlegen({
      id: "art-2",
      name: "Dreiecktuch",
      einheit: "Pkg",
      fach: "B-09",
      mindestbestand: 13,
      aktiv: true,
      bestelltAt: new Date("2026-05-01T08:00:00.000Z"),
    });
    const zielVorher = artikelMitId("art-1");
    const andererVorher = artikelMitId("art-2");

    const erg = await markiereBestellt({ artikelId: "art-1", bestellt: true }, t.db);

    expect(erg).toEqual({ ok: true });
    expect(artikelMitId("art-1")).toEqual({
      ...zielVorher,
      bestelltAt: BESTELLT_AM,
    });
    expect(artikelMitId("art-2")).toEqual(andererVorher);
    expect(revalidiert).toEqual([BESTELLUNG_PFAD, VERWALTUNG_PFAD]);
  });

  it("nimmt die Markierung zurück und bewahrt alle anderen Felder", async () => {
    artikelAnlegen();
    const vorher = artikelMitId("art-1");
    expect(vorher?.bestelltAt?.getTime()).toBe(VORHER_BESTELLT_AM.getTime());

    const erg = await markiereBestellt({ artikelId: "art-1", bestellt: false }, t.db);

    expect(erg).toEqual({ ok: true });
    expect(artikelMitId("art-1")).toEqual({ ...vorher, bestelltAt: null });
    expect(revalidiert).toEqual([BESTELLUNG_PFAD, VERWALTUNG_PFAD]);
  });

  it.each([
    { artikelId: "", bestellt: true },
    { artikelId: "art-1", bestellt: "ja" },
  ])("weist ungültige Eingaben ohne Änderung und Revalidierung zurück", async (eingabe) => {
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

    await expect(markiereBestellt({ artikelId: "", bestellt: true }, t.db))
      .rejects.toBe(verweigert);

    expect(adminRiegel).toHaveBeenCalledTimes(1);
    expect(artikelMitId("art-1")).toEqual(vorher);
    expect(revalidiert).toEqual([]);
  });
});
