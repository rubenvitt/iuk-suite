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

import {
  createArtikel, sammelAendereArtikel, setArtikelAktiv, updateArtikel,
} from "./artikel";

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

/**
 * DRK-294. Die Kategorie ist optional und Freitext — die zwei Zusagen, an denen
 * der Filter haengt: ein Leerstring kommt nie in die Datenbank (sonst gaebe es
 * eine unsichtbare Kategorie „", die man ausblenden koennte), und ein Update OHNE
 * das Feld laesst sie stehen (die Schublade speichert Feld fuer Feld).
 */
describe("Kategorie (DRK-294)", () => {
  const GRUND = { name: "Kompressen", einheit: "Stk", fach: "A1", mindestbestand: 1 };

  it("createArtikel speichert eine getrimmte Kategorie und ohne Angabe null", async () => {
    await createArtikel({ ...GRUND, kategorie: "  Verbandmaterial " }, t.db);
    await createArtikel({ ...GRUND, name: "Ohne" }, t.db);

    const zeilen = t.db.select().from(artikel).all();
    expect(zeilen.find((z) => z.name === "Kompressen")?.kategorie).toBe("Verbandmaterial");
    expect(zeilen.find((z) => z.name === "Ohne")?.kategorie).toBeNull();
  });

  it.each([[""], ["   "], [null]])("createArtikel macht aus %j „ohne Kategorie“", async (kategorie) => {
    const erg = await createArtikel({ ...GRUND, kategorie }, t.db);
    expect(erg.ok).toBe(true);
    expect(t.db.select().from(artikel).all()[0]?.kategorie).toBeNull();
  });

  it("updateArtikel setzt, aendert und leert die Kategorie", async () => {
    artikelAnlegen();

    expect(await updateArtikel("art-1", { kategorie: " Hygiene " }, t.db)).toEqual({ ok: true });
    expect(artikelMitId("art-1")?.kategorie).toBe("Hygiene");

    expect(await updateArtikel("art-1", { kategorie: "Technik" }, t.db)).toEqual({ ok: true });
    expect(artikelMitId("art-1")?.kategorie).toBe("Technik");

    expect(await updateArtikel("art-1", { kategorie: "  " }, t.db)).toEqual({ ok: true });
    expect(artikelMitId("art-1")?.kategorie).toBeNull();
    expect(revalidiert).toEqual([ARTIKEL_PFAD, ARTIKEL_PFAD, ARTIKEL_PFAD]);
  });

  it("updateArtikel ohne das Feld laesst die Kategorie stehen", async () => {
    artikelAnlegen({ kategorie: "Hygiene" });
    await updateArtikel("art-1", { fach: "B2" }, t.db);
    expect(artikelMitId("art-1")?.kategorie).toBe("Hygiene");
  });

  it("weist eine zu lange Kategorie am Feld zurueck, ohne zu schreiben", async () => {
    artikelAnlegen({ kategorie: "Hygiene" });
    const lang = "x".repeat(61);

    const anlegen = alsFehler(await createArtikel({ ...GRUND, kategorie: lang }, t.db));
    expect(anlegen.feldFehler).toHaveProperty("kategorie");

    const aendern = alsFehler(await updateArtikel("art-1", { kategorie: lang }, t.db));
    expect(aendern.feldFehler).toHaveProperty("kategorie");
    expect(artikelMitId("art-1")?.kategorie).toBe("Hygiene");
    expect(t.db.select().from(artikel).all()).toHaveLength(1);
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

/**
 * DRK-293 — mehrere Artikel gemeinsam bearbeiten.
 *
 * Die Auswahl der Felder ist die Entscheidung des Tickets, und die zwei Faelle,
 * die kein Typ abfaengt, stehen hier: ein Feld, das NICHT gemeinsam aenderbar
 * sein soll, darf auch dann nicht durchrutschen, wenn jemand es mitschickt —
 * und nicht ausgewaehlte Artikel bleiben unberuehrt.
 */
describe("sammelAendereArtikel (DRK-293)", () => {
  function drei(): void {
    artikelAnlegen({ id: "a", name: "Alpha", fach: "A-01", kategorie: "Hygiene" });
    artikelAnlegen({ id: "b", name: "Bravo", fach: "B-02", kategorie: null });
    artikelAnlegen({ id: "c", name: "Charlie", fach: "C-03", kategorie: "Hygiene" });
  }

  it("legt ein Feld auf die ausgewählten Artikel und lässt die übrigen in Ruhe", async () => {
    drei();

    const erg = await sammelAendereArtikel(
      { ids: ["a", "b"], aenderung: { kategorie: "Verbandmaterial" } },
      t.db,
    );

    expect(erg).toEqual({ ok: true, wert: { betroffen: 2 } });
    expect(artikelMitId("a")?.kategorie).toBe("Verbandmaterial");
    expect(artikelMitId("b")?.kategorie).toBe("Verbandmaterial");
    expect(artikelMitId("c")?.kategorie).toBe("Hygiene");
    expect(revalidiert).toEqual([ARTIKEL_PFAD, "/m/lagerbuch/verwaltung"]);
  });

  it("ändert mehrere Felder in einem Aufruf und rührt kein anderes an", async () => {
    drei();

    await sammelAendereArtikel(
      { ids: ["a"], aenderung: { kategorie: null, fach: "Z-99", aktiv: false } },
      t.db,
    );

    expect(artikelMitId("a")).toMatchObject({
      name: "Alpha",
      einheit: "Stk",
      mindestbestand: 7,
      kategorie: null,
      fach: "Z-99",
      aktiv: false,
    });
  });

  it.each([
    ["einheit", { einheit: "Pkg" }, (z: { einheit: string }) => z.einheit, "Stk"],
    ["mindestbestand", { mindestbestand: 99 }, (z: { mindestbestand: number }) => z.mindestbestand, 7],
    ["name", { name: "Manipuliert" }, (z: { name: string }) => z.name, "Alpha"],
  ])("ignoriert ein mitgeschicktes %s — es ist nicht gemeinsam änderbar", async (
    _feld, zusatz, lesen, erwartet,
  ) => {
    drei();

    const erg = await sammelAendereArtikel(
      { ids: ["a"], aenderung: { fach: "Z-99", ...zusatz } },
      t.db,
    );

    expect(erg.ok).toBe(true);
    const zeile = artikelMitId("a")!;
    expect(lesen(zeile)).toBe(erwartet);
    expect(zeile.fach).toBe("Z-99");
  });

  it("weist eine Änderung ohne ein einziges Feld zurück, ohne zu schreiben", async () => {
    drei();
    const vorher = artikelMitId("a");

    const erg = alsFehler(await sammelAendereArtikel({ ids: ["a"], aenderung: {} }, t.db));

    expect(erg.fehler).toBe("Bitte mindestens ein Feld zum Ändern auswählen.");
    expect(artikelMitId("a")).toEqual(vorher);
    expect(revalidiert).toEqual([]);
  });

  it("weist eine leere Auswahl zurück", async () => {
    drei();

    const erg = alsFehler(
      await sammelAendereArtikel({ ids: [], aenderung: { fach: "Z-99" } }, t.db),
    );

    expect(erg.feldFehler).toHaveProperty("ids");
    expect(artikelMitId("a")?.fach).toBe("A-01");
    expect(revalidiert).toEqual([]);
  });

  it("weist ein leeres Fach zurück, ohne einen Artikel anzufassen", async () => {
    drei();

    const erg = alsFehler(
      await sammelAendereArtikel({ ids: ["a", "b"], aenderung: { fach: "   " } }, t.db),
    );

    expect(erg.feldFehler).toHaveProperty("aenderung.fach");
    expect(artikelMitId("a")?.fach).toBe("A-01");
    expect(artikelMitId("b")?.fach).toBe("B-02");
  });

  it("zählt unbekannte Kennungen nicht mit und bricht an ihnen nicht ab", async () => {
    // Eine Auswahl kann älter sein als die Liste — ein inzwischen gelöschter
    // Artikel darf die übrigen nicht mitnehmen.
    drei();

    const erg = await sammelAendereArtikel(
      { ids: ["a", "gibt-es-nicht"], aenderung: { fach: "Z-99" } },
      t.db,
    );

    expect(erg).toEqual({ ok: true, wert: { betroffen: 1 } });
    expect(artikelMitId("a")?.fach).toBe("Z-99");
  });

  it("zählt eine doppelt geschickte Kennung einmal", async () => {
    drei();

    const erg = await sammelAendereArtikel(
      { ids: ["a", "a", "b"], aenderung: { aktiv: false } },
      t.db,
    );

    expect(erg).toEqual({ ok: true, wert: { betroffen: 2 } });
  });

  it("trägt eine Auswahl über mehr als einen Block", async () => {
    // Die IDs laufen in Blöcken von 400 ins `IN (…)`; 401 belegt, dass der
    // zweite Block dieselbe Änderung trägt und in derselben Transaktion liegt.
    const ids = Array.from({ length: 401 }, (_, i) => `m-${i}`);
    for (const id of ids) artikelAnlegen({ id, name: id, fach: "A-01" });

    const erg = await sammelAendereArtikel({ ids, aenderung: { fach: "Z-99" }, }, t.db);

    expect(erg).toEqual({ ok: true, wert: { betroffen: 401 } });
    expect(artikelMitId("m-0")?.fach).toBe("Z-99");
    expect(artikelMitId("m-400")?.fach).toBe("Z-99");
  });

  it("verlangt den Admin-Riegel, bevor irgendetwas geprüft wird", async () => {
    drei();
    adminRiegel.mockRejectedValueOnce(new Error("kein Zugang"));

    await expect(
      sammelAendereArtikel({ ids: ["a"], aenderung: { fach: "Z-99" } }, t.db),
    ).rejects.toThrow("kein Zugang");
    expect(artikelMitId("a")?.fach).toBe("A-01");
  });
});
