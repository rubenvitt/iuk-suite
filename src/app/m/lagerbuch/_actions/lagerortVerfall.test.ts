import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  artikel,
  lagerorte,
  lagerortVerfall,
  sollPositionen,
} from "../_db/schema";
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

import { verfallSetzen } from "./lagerortVerfall";

const VIEWER = {
  sub: "u-admin",
  groups: ["lagerbuch"],
  name: "A. Verwaltung",
  email: null,
};
const JETZT = new Date("2026-08-07T10:20:30.000Z");
const FAHRZEUG_ID = "fahrzeug-1";
const ARTIKEL_ID = "artikel-1";
const VERFALL = "2027-03";

const PFADE = [
  `/m/lagerbuch/verwaltung/fahrzeuge/${FAHRZEUG_ID}`,
  "/m/lagerbuch/verwaltung/fahrzeuge",
  "/m/lagerbuch/verwaltung/verfall",
];

let t: TestDb;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(JETZT);
  revalidiert.length = 0;
  adminRiegel.mockResolvedValue(VIEWER);
  t = migrierteTestDb("lagerbuch-actions-lagerort-verfall-");
});

afterEach(() => {
  t.schliessen();
  vi.useRealTimers();
  vi.clearAllMocks();
});

function aufbauen({
  mitSoll = true,
  entfernt = false,
}: {
  mitSoll?: boolean;
  entfernt?: boolean;
} = {}): void {
  t.db.insert(lagerorte).values({
    id: FAHRZEUG_ID,
    name: "RTW 1",
    typ: "fahrzeug",
    kennung: "1/83-1",
    aktiv: true,
  }).run();
  t.db.insert(artikel).values({
    id: ARTIKEL_ID,
    name: "Mullbinde",
    einheit: "Stk",
    fach: "A-01",
    mindestbestand: 4,
    aktiv: true,
    createdAt: JETZT,
  }).run();
  if (mitSoll) {
    t.db.insert(sollPositionen).values({
      id: "soll-1",
      fahrzeugId: FAHRZEUG_ID,
      fachLabel: "Fach 1",
      sort: 0,
      artikelId: ARTIKEL_ID,
      soll: 2,
      templatePositionId: null,
      ueberschrieben: false,
      entfernt,
    }).run();
  }
}

function verfallVorbelegen(): void {
  t.db.insert(lagerortVerfall).values({
    id: "lagerort-verfall-1",
    lagerortId: FAHRZEUG_ID,
    artikelId: ARTIKEL_ID,
    verfall: "2026-11",
    erfasstAt: new Date("2026-07-01T08:00:00.000Z"),
    quelleTyp: "token",
    quelleId: "111-111",
  }).run();
}

function eintrag() {
  return t.db.select().from(lagerortVerfall).where(and(
    eq(lagerortVerfall.lagerortId, FAHRZEUG_ID),
    eq(lagerortVerfall.artikelId, ARTIKEL_ID),
  )).get();
}

describe("verfallSetzen", () => {
  it("setzt den Verfall nur für die Sollposition und revalidiert die drei inneren Pfade", async () => {
    aufbauen();

    const erg = await verfallSetzen({
      lagerortId: FAHRZEUG_ID,
      artikelId: ARTIKEL_ID,
      verfall: VERFALL,
    }, t.db);

    expect(erg).toEqual({ ok: true, wert: { gesetzt: true } });
    expect(eintrag()).toMatchObject({
      lagerortId: FAHRZEUG_ID,
      artikelId: ARTIKEL_ID,
      verfall: VERFALL,
      erfasstAt: JETZT,
      quelleTyp: "oidc",
      quelleId: VIEWER.sub,
    });
    expect(revalidiert).toEqual(PFADE);
  });

  it.each([
    { leerwert: null, beschreibung: "null" },
    { leerwert: "", beschreibung: "Leerstring" },
  ])("entfernt die Angabe bei $beschreibung und meldet gesetzt:false", async ({ leerwert }) => {
    aufbauen();
    verfallVorbelegen();
    expect(eintrag()).toBeDefined();

    const erg = await verfallSetzen({
      lagerortId: FAHRZEUG_ID,
      artikelId: ARTIKEL_ID,
      verfall: leerwert,
    }, t.db);

    expect(erg).toEqual({ ok: true, wert: { gesetzt: false } });
    expect(eintrag()).toBeUndefined();
    expect(revalidiert).toEqual(PFADE);
  });

  it("lehnt einen Artikel außerhalb des Solls ohne Schreiben und Revalidierung ab", async () => {
    aufbauen({ mitSoll: false });

    const erg = await verfallSetzen({
      lagerortId: FAHRZEUG_ID,
      artikelId: ARTIKEL_ID,
      verfall: VERFALL,
    }, t.db);

    expect(erg).toEqual({
      ok: false,
      fehler: "Artikel steht an diesem Lagerort nicht im Soll.",
    });
    expect(t.db.select().from(lagerortVerfall).all()).toEqual([]);
    expect(revalidiert).toEqual([]);
  });

  it("zählt eine entfernte Sollposition weiterhin als Sollzugehörigkeit", async () => {
    aufbauen({ entfernt: true });

    const erg = await verfallSetzen({
      lagerortId: FAHRZEUG_ID,
      artikelId: ARTIKEL_ID,
      verfall: VERFALL,
    }, t.db);

    expect(erg).toEqual({ ok: true, wert: { gesetzt: true } });
    expect(eintrag()?.verfall).toBe(VERFALL);
    expect(revalidiert).toEqual(PFADE);
  });

  it("meldet einen unbekannten Lagerort fest und schreibt oder revalidiert nichts", async () => {
    aufbauen();

    const erg = await verfallSetzen({
      lagerortId: "unbekannter-lagerort",
      artikelId: ARTIKEL_ID,
      verfall: VERFALL,
    }, t.db);

    expect(erg).toEqual({ ok: false, fehler: "Lagerort nicht gefunden." });
    expect(t.db.select().from(lagerortVerfall).all()).toEqual([]);
    expect(revalidiert).toEqual([]);
  });

  it("weist einen ungültigen Monat mit Feldfehler ohne Schreiben und Revalidierung zurück", async () => {
    aufbauen();

    const erg = await verfallSetzen({
      lagerortId: FAHRZEUG_ID,
      artikelId: ARTIKEL_ID,
      verfall: "2027-13",
    }, t.db);

    expect(erg).toEqual({
      ok: false,
      fehler: "Bitte die markierten Felder prüfen.",
      feldFehler: { verfall: "Verfall muss das Format YYYY-MM haben" },
    });
    expect(t.db.select().from(lagerortVerfall).all()).toEqual([]);
    expect(revalidiert).toEqual([]);
  });

  it("lässt bei ungültiger Eingabe zuerst den Admin-Riegel entscheiden", async () => {
    aufbauen();
    const verweigert = new Error("Kein Lagerbuch-Zugang");
    adminRiegel.mockRejectedValueOnce(verweigert);

    await expect(verfallSetzen({
      lagerortId: "",
      artikelId: "",
      verfall: "kein-monat",
    }, t.db)).rejects.toBe(verweigert);

    expect(adminRiegel).toHaveBeenCalledTimes(1);
    expect(t.db.select().from(lagerortVerfall).all()).toEqual([]);
    expect(revalidiert).toEqual([]);
  });
});
