import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { artikel, buchungen, chargen } from "../_db/schema";
import type { DB } from "../_db/client";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import { CHARGE_OHNE_VERFALL, HANDLAGER_ID, PSEUDO_VERFALL } from "../_lib/konstanten";

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

import { importArtikelCsv } from "./csv";

const VIEWER = {
  sub: "u-admin",
  groups: ["lagerbuch"],
  name: "A. Verwaltung",
  email: null,
};
const JETZT = new Date("2026-08-07T12:34:56.000Z");
const LISTENPFAD = "/m/lagerbuch/verwaltung/artikel";
const KOPF = "Name;Einheit;Fach;Mindestbestand;Startbestand";

let t: TestDb;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(JETZT);
  revalidiert.length = 0;
  adminRiegel.mockResolvedValue(VIEWER);
  t = migrierteTestDb("lagerbuch-actions-csv-");
});

afterEach(() => {
  t.schliessen();
  vi.useRealTimers();
  vi.clearAllMocks();
});

function wert<T>(ergebnis: unknown): T {
  return (ergebnis as { ok: true; wert: T }).wert;
}

describe("importArtikelCsv", () => {
  it("legt Artikel an und bucht positiven Startbestand mit den festen Korrekturschluesseln", async () => {
    const ergebnis = await importArtikelCsv(
      `${KOPF}\nMull;Stk;A1;20;5\nKompressen;Pkg;B2;10;0`,
      t.db,
    );

    expect(ergebnis).toEqual({ ok: true, wert: { angelegt: 2, fehler: [] } });
    expect(t.db.select().from(artikel).all().map((a) => a.name).sort())
      .toEqual(["Kompressen", "Mull"]);
    expect(t.db.select().from(chargen).all()).toHaveLength(1);
    expect(t.db.select().from(chargen).all()[0]).toMatchObject({
      chargenNr: CHARGE_OHNE_VERFALL,
      verfall: PSEUDO_VERFALL,
      createdAt: JETZT,
    });
    expect(t.db.select().from(buchungen).all()).toHaveLength(1);
    expect(t.db.select().from(buchungen).all()[0]).toMatchObject({
      ts: JETZT,
      typ: "korrektur",
      lagerortId: HANDLAGER_ID,
      menge: 5,
      quelleTyp: "oidc",
      quelleId: VIEWER.sub,
      kommentar: "CSV-Startbestand",
    });
    expect(revalidiert).toEqual([LISTENPFAD]);
  });

  it("legt bei Startbestand null weder Charge noch Buchung an", async () => {
    const ergebnis = await importArtikelCsv(`${KOPF}\nMull;Stk;A1;1;0`, t.db);

    expect(wert<{ angelegt: number }>(ergebnis).angelegt).toBe(1);
    expect(t.db.select().from(artikel).all()).toHaveLength(1);
    expect(t.db.select().from(chargen).all()).toEqual([]);
    expect(t.db.select().from(buchungen).all()).toEqual([]);
    expect(revalidiert).toEqual([LISTENPFAD]);
  });

  it("reicht Parserfehler mit Zeilennummer durch und importiert gueltige Zeilen weiter", async () => {
    const ergebnis = await importArtikelCsv(
      `${KOPF}\nMull;Stk\nKompressen;Pkg;B2;10;0`,
      t.db,
    );

    expect(ergebnis).toEqual({
      ok: true,
      wert: {
        angelegt: 1,
        fehler: [
          "Zeile 2: erwartet 5 Spalten (Name, Einheit, Fach, Mindestbestand, Startbestand), gefunden 2.",
        ],
      },
    });
    expect(t.db.select().from(artikel).all().map((a) => a.name)).toEqual(["Kompressen"]);
    expect(revalidiert).toEqual([LISTENPFAD]);
  });

  it("isoliert jede Zeile in einer Transaktion, setzt nach Fehlern fort und verbirgt DB-Texte", async () => {
    t.sqlite.exec(`
      CREATE TRIGGER csv_buchung_fehler
      BEFORE INSERT ON buchungen
      WHEN (SELECT fach FROM artikel WHERE id = NEW.artikel_id) = 'FEHLER'
      BEGIN
        SELECT RAISE(ABORT, 'db-intern: geheimer CSV-Fehler');
      END;
    `);

    const ergebnis = await importArtikelCsv(
      `${KOPF}\n\nMull;Stk;A1;1;2\nMull;Pkg;FEHLER;1;3\nMull;Box;A3;1;4`,
      t.db,
    );

    expect(ergebnis).toEqual({
      ok: true,
      wert: { angelegt: 2, fehler: ["Zeile 4: „Mull“ konnte nicht angelegt werden."] },
    });
    expect(wert<{ fehler: string[] }>(ergebnis).fehler.join(" ")).not.toContain("db-intern");
    expect(t.db.select().from(artikel).all().map(({ name, einheit, fach }) => ({ name, einheit, fach })))
      .toEqual([
        { name: "Mull", einheit: "Stk", fach: "A1" },
        { name: "Mull", einheit: "Box", fach: "A3" },
      ]);
    expect(t.db.select().from(chargen).all()).toHaveLength(2);
    expect(t.db.select().from(buchungen).all()).toHaveLength(2);
    expect(revalidiert).toEqual([LISTENPFAD]);
  });

  it("laesst den Admin-Riegel vor Parser und Datenbank entscheiden", async () => {
    const verweigert = new Error("Kein Lagerbuch-Zugang");
    adminRiegel.mockRejectedValueOnce(verweigert);
    const unerreichbareDb = new Proxy({}, {
      get: () => { throw new Error("Datenbank wurde vor dem Riegel beruehrt"); },
    }) as DB;

    await expect(importArtikelCsv("kein CSV", unerreichbareDb)).rejects.toBe(verweigert);

    expect(adminRiegel).toHaveBeenCalledTimes(1);
    expect(revalidiert).toEqual([]);
  });
});
