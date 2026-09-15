import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import { artikel, buchungen, chargen, lagerorte } from "../_db/schema";
import { bestandJeArtikel } from "../_lib/lesepfade/bestand";
import { handlagerOrte } from "../_lib/lesepfade/orte";
import { HANDLAGER_ID } from "../_lib/konstanten";

/**
 * DRK-297, Aufgabe 8 — die Schreibseite fuer Schraenke im Handlager.
 *
 * Das Testmuster (Admin-Mock, `getDb`-Riegel, `revalidatePath`-Spion) ist 1:1
 * aus `_actions/fahrzeuge.test.ts` uebernommen — kein zweites Harness.
 */

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
  getDb: () => { throw new Error("getDb() im Test — jeder Aufruf uebergibt t.db"); },
}));

import { createSchrank, setSchrankAktiv, updateSchrank } from "./lagerorte";

const JETZT = new Date("2026-06-15T10:00:00Z");
const VIEWER = {
  sub: "u-admin",
  groups: ["lagerbuch"],
  name: "A. Verwaltung",
  email: null,
};
const LAGERORTE_PFAD = "/m/lagerbuch/verwaltung/lagerorte";
const ARTIKEL_PFAD = "/m/lagerbuch/verwaltung/artikel";
const ARTIKEL_A = "art-a";
const RTW1 = "rtw-1";

let t: TestDb;

function wert<T>(ergebnis: unknown): T {
  return (ergebnis as { ok: true; wert: T }).wert;
}

function fehlerVon(ergebnis: unknown) {
  return ergebnis as { ok: false; fehler: string; feldFehler?: Record<string, string> };
}

beforeEach(() => {
  revalidiert.length = 0;
  adminRiegel.mockResolvedValue(VIEWER);
  t = migrierteTestDb("lagerbuch-actions-lagerorte-");

  // Das Handlager kommt aus Migration 0003. Ein zweiter Insert waere kein
  // harmloses Fixture, sondern ein UNIQUE-Verstoss.
  expect(t.db.select().from(lagerorte).where(eq(lagerorte.id, HANDLAGER_ID)).get())
    .toMatchObject({ typ: "lager", aktiv: true, parentId: null });

  t.db.insert(lagerorte).values({
    id: RTW1,
    name: "RTW 1",
    typ: "fahrzeug",
    kennung: "UE-RK 1234",
    aktiv: true,
    templateId: null,
  }).run();

  t.db.insert(lagerorte).values({
    id: "schrank-1",
    name: "Schrank 1",
    typ: "lager",
    kennung: null,
    aktiv: true,
    parentId: HANDLAGER_ID,
    zugangshinweis: null,
    sortierung: 5,
  }).run();

  t.db.insert(artikel).values({
    id: ARTIKEL_A,
    name: "Mullbinde",
    einheit: "Stk.",
    fach: "A-01",
    mindestbestand: 0,
    aktiv: true,
    createdAt: JETZT,
  }).run();
  t.db.insert(chargen).values({
    id: "charge-a",
    artikelId: ARTIKEL_A,
    chargenNr: "charge-a",
    verfall: "2099-12",
    createdAt: JETZT,
  }).run();
  t.db.insert(buchungen).values({
    id: "buchung-a",
    ts: JETZT,
    typ: "zugang",
    artikelId: ARTIKEL_A,
    chargeId: "charge-a",
    lagerortId: "schrank-1",
    menge: 12,
    quelleTyp: "system",
    quelleId: "fixture",
    referenz: null,
    kommentar: null,
  }).run();
});

afterEach(() => {
  t.schliessen();
  vi.clearAllMocks();
});

describe("createSchrank", () => {
  it("legt einen Schrank unter dem Handlager an", async () => {
    // NICHT „Schrank 1": den traegt das Fixture bereits, und seit DRK-367 wird
    // dieser Aufruf abgewiesen. Der Test meint die Anlage, nicht den Namen.
    const e = await createSchrank({ name: "Schrank 3", sortierung: 10 }, t.db);
    expect(e.ok).toBe(true);
    const zeile = t.db.select().from(lagerorte)
      .where(eq(lagerorte.id, wert<{ id: string }>(e).id)).get();
    expect(zeile?.parentId).toBe(HANDLAGER_ID);
    expect(zeile?.typ).toBe("lager");
    expect(zeile?.aktiv).toBe(true);
    expect(revalidiert).toEqual([LAGERORTE_PFAD, ARTIKEL_PFAD]);
  });

  /** `null` heisst „kein Hinweis" — nie ein Leerstring. Ein Leerstring
   *  renderte spaeter ein leeres Hinweis-Abzeichen. */
  it("macht aus einem leeren Hinweis null", async () => {
    const e = await createSchrank({ name: "Schrank 2", zugangshinweis: "   " }, t.db);
    const zeile = t.db.select().from(lagerorte)
      .where(eq(lagerorte.id, wert<{ id: string }>(e).id)).get();
    expect(zeile?.zugangshinweis).toBeNull();
  });

  it("weist einen leeren Namen ab", async () => {
    expect(fehlerVon(await createSchrank({ name: "  " }, t.db))).toMatchObject({ ok: false });
    expect(revalidiert).toEqual([]);
  });

  /**
   * DRK-367 — zwei Schraenke duerfen nicht gleich heissen. Der Satz steht am
   * FELD und daneben: das Formular markiert sonst nichts, und die Person raet,
   * welches der drei Felder gemeint ist.
   */
  it("weist einen bereits vergebenen Namen ab", async () => {
    const e = fehlerVon(await createSchrank({ name: "Schrank 1" }, t.db));
    expect(e).toEqual({
      ok: false,
      fehler: "Dieser Name ist bereits vergeben.",
      feldFehler: { name: "Dieser Name ist bereits vergeben." },
    });
    expect(t.db.select().from(lagerorte).where(eq(lagerorte.parentId, HANDLAGER_ID)).all())
      .toHaveLength(1);
    expect(revalidiert).toEqual([]);
  });

  it("zaehlt Schreibweise und Leerraum als denselben Namen", async () => {
    // Zwei Eintraege, die sich nur in Gross-/Kleinschreibung unterscheiden, sind
    // in einer Auswahlliste nicht auseinanderzuhalten — der Grund fuer das
    // Ticket bleibt derselbe.
    expect(fehlerVon(await createSchrank({ name: "  schrank 1  " }, t.db)).fehler)
      .toBe("Dieser Name ist bereits vergeben.");
    // ⚠️ MIT UMLAUT, weil SQLites `lower()` ASCII-only ist: diese Zeile faellt
    // zurueck auf die Probe in der Action, nicht auf den Index.
    await createSchrank({ name: "Schränkchen" }, t.db);
    expect(fehlerVon(await createSchrank({ name: "SCHRÄNKCHEN" }, t.db)).fehler)
      .toBe("Dieser Name ist bereits vergeben.");
  });

  it("laesst einen Namen zu, den nur ein FAHRZEUG traegt", async () => {
    // Fahrzeuge haengen nicht am Handlager und stehen nie in derselben Auswahl
    // wie ein Schrank. Ein Riegel darueber waere eine Regel ohne Anlass.
    expect((await createSchrank({ name: "RTW 1" }, t.db)).ok).toBe(true);
  });
});

describe("updateSchrank", () => {
  it("aendert Name, Hinweis und Sortierung eines bestehenden Schranks", async () => {
    const e = await updateSchrank({
      id: "schrank-1",
      name: "Schrank 1 (Flur)",
      zugangshinweis: "  Schluessel bei LvD  ",
      sortierung: 20,
    }, t.db);

    expect(e).toEqual({ ok: true });
    expect(t.db.select().from(lagerorte).where(eq(lagerorte.id, "schrank-1")).get())
      .toMatchObject({
        name: "Schrank 1 (Flur)",
        zugangshinweis: "Schluessel bei LvD",
        sortierung: 20,
      });
    expect(revalidiert).toEqual([LAGERORTE_PFAD, ARTIKEL_PFAD]);
  });

  /** DRK-367 — ohne die Selbst-Ausnahme kollidierte jede Bearbeitung, die den
   *  Namen gar nicht anfasst, mit sich selbst. */
  it("laesst einen Schrank seinen eigenen Namen behalten", async () => {
    const e = await updateSchrank({ id: "schrank-1", name: "Schrank 1", sortierung: 9 }, t.db);
    expect(e).toEqual({ ok: true });
    expect(t.db.select().from(lagerorte).where(eq(lagerorte.id, "schrank-1")).get())
      .toMatchObject({ name: "Schrank 1", sortierung: 9 });
  });

  it("weist einen Namen ab, den ein ANDERER Schrank schon traegt", async () => {
    const neu = wert<{ id: string }>(await createSchrank({ name: "GF-Schrank" }, t.db));
    revalidiert.length = 0;

    const e = fehlerVon(await updateSchrank({ id: neu.id, name: "Schrank 1" }, t.db));
    expect(e).toEqual({
      ok: false,
      fehler: "Dieser Name ist bereits vergeben.",
      feldFehler: { name: "Dieser Name ist bereits vergeben." },
    });
    expect(t.db.select().from(lagerorte).where(eq(lagerorte.id, neu.id)).get()?.name)
      .toBe("GF-Schrank");
    expect(revalidiert).toEqual([]);
  });

  it("weist eine unbekannte ID ab, ohne etwas zu schreiben", async () => {
    const e = await updateSchrank({ id: "nicht-vorhanden", name: "X" }, t.db);
    expect(e).toEqual({ ok: false, fehler: "Schrank nicht gefunden." });
    expect(revalidiert).toEqual([]);
  });

  it("laesst sich nicht auf den Handlager selbst anwenden", async () => {
    const e = await updateSchrank({ id: HANDLAGER_ID, name: "Umbenannt" }, t.db);
    expect(e).toEqual({ ok: false, fehler: "Schrank nicht gefunden." });
    expect(t.db.select().from(lagerorte).where(eq(lagerorte.id, HANDLAGER_ID)).get()?.name)
      .not.toBe("Umbenannt");
  });

  it("laesst sich nicht auf ein Fahrzeug anwenden", async () => {
    const e = await updateSchrank({ id: RTW1, name: "Umbenannt" }, t.db);
    expect(e).toEqual({ ok: false, fehler: "Schrank nicht gefunden." });
    expect(t.db.select().from(lagerorte).where(eq(lagerorte.id, RTW1)).get()?.name)
      .not.toBe("Umbenannt");
  });
});

describe("setSchrankAktiv", () => {
  it("legt einen Schrank still, ohne seinen Bestand anzufassen", async () => {
    await setSchrankAktiv({ id: "schrank-1", aktiv: false }, t.db);
    expect(t.db.select().from(lagerorte).where(eq(lagerorte.id, "schrank-1")).get()?.aktiv)
      .toBe(false);
    expect(bestandJeArtikel(t.db, handlagerOrte(t.db)).get(ARTIKEL_A)).toBe(12);
    expect(revalidiert).toEqual([LAGERORTE_PFAD, ARTIKEL_PFAD]);
  });

  /** Die Wurzel ist der feste Bezugspunkt jeder Buchung. */
  it("legt den Handlager selbst nicht still", async () => {
    expect(await setSchrankAktiv({ id: HANDLAGER_ID, aktiv: false }, t.db))
      .toMatchObject({ ok: false });
    expect(t.db.select().from(lagerorte).where(eq(lagerorte.id, HANDLAGER_ID)).get()?.aktiv)
      .toBe(true);
    expect(revalidiert).toEqual([]);
  });

  it("fasst ein Fahrzeug nicht an", async () => {
    expect(await setSchrankAktiv({ id: RTW1, aktiv: false }, t.db))
      .toMatchObject({ ok: false });
    expect(t.db.select().from(lagerorte).where(eq(lagerorte.id, RTW1)).get()?.aktiv)
      .toBe(true);
    expect(revalidiert).toEqual([]);
  });

  it("weist eine ungueltige Eingabe ab", async () => {
    expect(await setSchrankAktiv({ id: "schrank-1", aktiv: "nein" }, t.db))
      .toMatchObject({ ok: false });
    expect(revalidiert).toEqual([]);
  });
});
