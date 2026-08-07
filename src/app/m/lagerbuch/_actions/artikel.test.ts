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

import { createArtikel, setArtikelAktiv, updateArtikel } from "./artikel";

const VIEWER = {
  sub: "u-admin",
  groups: ["lagerbuch"],
  name: "A. Verwaltung",
  email: null,
};
const JETZT = new Date("2026-06-15T10:00:00Z");
const ARTIKEL_PFAD = "/m/lagerbuch/verwaltung/artikel";

let t: TestDb;

beforeEach(() => {
  revalidiert.length = 0;
  adminRiegel.mockResolvedValue(VIEWER);
  t = migrierteTestDb("lagerbuch-actions-artikel-");
});

afterEach(() => {
  t.schliessen();
  vi.clearAllMocks();
});

function artikelAnlegen(
  werte: Partial<typeof artikel.$inferInsert> = {},
): typeof artikel.$inferInsert {
  const zeile: typeof artikel.$inferInsert = {
    id: "art-1",
    name: "Mullbinde",
    einheit: "Stk",
    fach: "A-01",
    mindestbestand: 7,
    aktiv: true,
    createdAt: JETZT,
    ...werte,
  };
  t.db.insert(artikel).values(zeile).run();
  return zeile;
}

function artikelMitId(id: string) {
  return t.db.select().from(artikel).where(eq(artikel.id, id)).get();
}

function alsFehler(erg: { ok: boolean }) {
  expect(erg.ok).toBe(false);
  return erg as { ok: false; fehler: string; feldFehler?: Record<string, string> };
}

describe("createArtikel", () => {
  it("speichert getrimmte Werte aktiv und liefert genau die gespeicherte Kennung", async () => {
    const erg = await createArtikel({
      name: "  Kompressen steril  ",
      einheit: " Stk ",
      fach: " A1 ",
      mindestbestand: 20,
    }, t.db);

    expect(erg.ok).toBe(true);
    const id = (erg as { ok: true; wert: { id: string } }).wert.id;
    const zeilen = t.db.select().from(artikel).all();
    expect(zeilen).toHaveLength(1);
    expect(id).toBe(zeilen[0]?.id);
    expect(zeilen[0]).toMatchObject({
      name: "Kompressen steril",
      einheit: "Stk",
      fach: "A1",
      mindestbestand: 20,
      aktiv: true,
    });
    expect(revalidiert).toEqual([ARTIKEL_PFAD]);
  });

  it.each([
    [
      { name: "  ", einheit: "Stk", fach: "A1", mindestbestand: 1 },
      "name",
    ],
    [
      { name: "Kompressen", einheit: "Stk", fach: "A1", mindestbestand: -1 },
      "mindestbestand",
    ],
  ])("weist ungültige Eingaben am Feld zurück, ohne zu schreiben", async (eingabe, feld) => {
    const erg = alsFehler(await createArtikel(eingabe, t.db));

    expect(erg.fehler).toBe("Bitte die markierten Felder prüfen.");
    expect(erg.feldFehler).toHaveProperty(feld);
    expect(t.db.select().from(artikel).all()).toEqual([]);
    expect(revalidiert).toEqual([]);
  });
});

describe("updateArtikel", () => {
  it("ändert nur das gesendete Feld, auch wenn ein anderer Ein-Feld-Commit später eintrifft", async () => {
    artikelAnlegen();

    await updateArtikel("art-1", { fach: " B-02 " }, t.db);
    revalidiert.length = 0;
    const erg = await updateArtikel("art-1", { mindestbestand: 42 }, t.db);

    expect(erg).toEqual({ ok: true });
    expect(artikelMitId("art-1")).toMatchObject({
      name: "Mullbinde",
      einheit: "Stk",
      fach: "B-02",
      mindestbestand: 42,
      aktiv: true,
    });
    expect(revalidiert).toEqual([ARTIKEL_PFAD]);
  });

  it("ändert eine gesendete Einheit und trimmt sie", async () => {
    artikelAnlegen();

    const erg = await updateArtikel("art-1", { einheit: " Pkg " }, t.db);

    expect(erg).toEqual({ ok: true });
    expect(artikelMitId("art-1")?.einheit).toBe("Pkg");
    expect(revalidiert).toEqual([ARTIKEL_PFAD]);
  });

  it.each([
    [{ mindestbestand: -1 }, "mindestbestand"],
    [{ fach: "   " }, "fach"],
  ])("weist ungültige Änderungen zurück, ohne den Artikel zu verändern", async (eingabe, feld) => {
    artikelAnlegen();
    const vorher = artikelMitId("art-1");

    const erg = alsFehler(await updateArtikel("art-1", eingabe, t.db));

    expect(erg.fehler).toBe("Bitte die markierten Felder prüfen.");
    expect(erg.feldFehler).toHaveProperty(feld);
    expect(artikelMitId("art-1")).toEqual(vorher);
    expect(revalidiert).toEqual([]);
  });

  it("behandelt eine leere Änderung als erfolgreichen No-op ohne Revalidierung", async () => {
    artikelAnlegen();
    const vorher = artikelMitId("art-1");

    const erg = await updateArtikel("art-1", {}, t.db);

    expect(erg).toEqual({ ok: true });
    expect(artikelMitId("art-1")).toEqual(vorher);
    expect(revalidiert).toEqual([]);
  });

  it("erlaubt nicht, den Namen über die eingeschränkte Update-Eingabe zu ändern", async () => {
    artikelAnlegen();

    const erg = await updateArtikel("art-1", { name: "Manipuliert" }, t.db);

    expect(erg).toEqual({ ok: true });
    expect(artikelMitId("art-1")?.name).toBe("Mullbinde");
    expect(revalidiert).toEqual([]);
  });
});

describe("setArtikelAktiv", () => {
  it("ändert nur den Zielartikel und revalidiert zusätzlich die Übersicht", async () => {
    artikelAnlegen();
    artikelAnlegen({ id: "art-2", name: "Dreiecktuch", fach: "A-02" });
    const zielVorher = artikelMitId("art-1");
    const andererVorher = artikelMitId("art-2");

    const erg = await setArtikelAktiv({ id: "art-1", aktiv: false }, t.db);

    expect(erg).toEqual({ ok: true });
    expect(artikelMitId("art-1")).toEqual({ ...zielVorher, aktiv: false });
    expect(artikelMitId("art-2")).toEqual(andererVorher);
    expect(revalidiert).toEqual([
      ARTIKEL_PFAD,
      "/m/lagerbuch/verwaltung",
    ]);
  });

  it("weist ungültige Eingaben ohne Änderung und Revalidierung zurück", async () => {
    artikelAnlegen();
    const vorher = artikelMitId("art-1");

    const erg = alsFehler(await setArtikelAktiv({ id: "art-1", aktiv: "nein" }, t.db));

    expect(erg.fehler).toBe("Ungültige Eingabe.");
    expect(artikelMitId("art-1")).toEqual(vorher);
    expect(revalidiert).toEqual([]);
  });
});

describe("Riegel vor Validierung", () => {
  it("lässt bei ungültiger Eingabe in jeder Action zuerst den Admin-Riegel entscheiden", async () => {
    const aufrufe = [
      () => createArtikel({}, t.db),
      () => updateArtikel("art-1", { fach: "   " }, t.db),
      () => setArtikelAktiv({}, t.db),
    ];

    for (const [index, aufruf] of aufrufe.entries()) {
      const verweigert = new Error(`Riegel ${index}`);
      adminRiegel.mockRejectedValueOnce(verweigert);
      await expect(aufruf()).rejects.toBe(verweigert);
    }

    expect(adminRiegel).toHaveBeenCalledTimes(3);
    expect(t.db.select().from(artikel).all()).toEqual([]);
    expect(revalidiert).toEqual([]);
  });
});
