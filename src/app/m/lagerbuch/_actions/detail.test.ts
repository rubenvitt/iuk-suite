import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DB } from "../_db/client";
import { artikel, buchungen, chargen, lagerorte, tokens, users } from "../_db/schema";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import { ARTIKEL_VERLAUF_GRENZE } from "../_lib/grenzen";
import { HANDLAGER_ID } from "../_lib/konstanten";

/**
 * DRK-297, Aufgabe 11 — der Befund aus dem Ticket: eine Charge, die
 * vollstaendig im Fahrzeug liegt, verschwindet aus dem Artikeldetail.
 * Eigene Artikel/Ort-Fixtures, additiv zu "a1" oben, damit die bestehenden
 * Faelle unberuehrt bleiben.
 */
const ARTIKEL_A = "art-a";
const RTW1 = "rtw-1";
const SCHRANK_GF = "schrank-gf";

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

import { getDetail, type ArtikelDetailCharge } from "./detail";

const NOW = new Date("2026-06-15T10:00:00.000Z");
const VIEWER = {
  sub: "u-admin",
  groups: ["lagerbuch"],
  name: "A. Verwaltung",
  email: null,
};

let t: TestDb;

function zeit(stunden: number, minuten = 0): Date {
  return new Date(NOW.getTime() + (stunden * 60 + minuten) * 60_000);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("LAGERBUCH_VERFALL_ROT_TAGE", "31");
  vi.stubEnv("LAGERBUCH_VERFALL_GELB_TAGE", "56");
  revalidiert.length = 0;
  adminRiegel.mockResolvedValue(VIEWER);
  t = migrierteTestDb("lagerbuch-actions-detail-");

  t.db.insert(users).values({
    id: "u-admin",
    name: "Anna Verwaltung",
    email: "anna@example.org",
    lastLoginAt: NOW,
  }).run();
  t.db.insert(tokens).values({
    id: "token-1",
    code: "111-111",
    label: "RTW 1 Karte",
    scopeLagerortId: null,
    zielTyp: null,
    zielId: null,
    aktiv: true,
    createdAt: NOW,
    createdBy: "u-admin",
    lastUsedAt: null,
  }).run();
  t.db.insert(artikel).values({
    id: "a1",
    name: "Kompressen steril",
    einheit: "Stk",
    fach: "A1",
    mindestbestand: 20,
    aktiv: true,
    createdAt: NOW,
  }).run();
  t.db.insert(chargen).values([
    { id: "c-rot", artikelId: "a1", chargenNr: "ROT", verfall: "2026-06", createdAt: NOW },
    { id: "c-gelb", artikelId: "a1", chargenNr: "GELB", verfall: "2026-07", createdAt: NOW },
    { id: "c-gruen", artikelId: "a1", chargenNr: "GRUEN", verfall: "2027-03", createdAt: NOW },
    { id: "c-leer", artikelId: "a1", chargenNr: "LEER", verfall: "2026-05", createdAt: NOW },
  ]).run();

  const buchung = (
    id: string,
    ts: Date,
    chargeId: string,
    menge: number,
    quelleTyp: "token" | "oidc" | "system" = "system",
    quelleId = "import",
  ) => ({
    id,
    ts,
    typ: menge < 0 ? "entnahme" as const : "korrektur" as const,
    artikelId: "a1",
    chargeId,
    lagerortId: HANDLAGER_ID,
    menge,
    quelleTyp,
    quelleId,
    referenz: null,
    kommentar: id,
  });

  t.db.insert(buchungen).values([
    buchung("b-alt-extra", zeit(-7), "c-gruen", 1),
    buchung("b-rot", zeit(-6), "c-rot", 2),
    buchung("b-gelb", zeit(-5), "c-gelb", 3),
    buchung("b-gruen", zeit(-4), "c-gruen", 5),
    buchung("b-leer-rein", zeit(-3), "c-leer", 2),
    buchung("b-leer-raus", zeit(-2), "c-leer", -2),
    buchung("b-oidc", zeit(0, 1), "c-gruen", 1, "oidc", "u-admin"),
    buchung("b-token", zeit(0, 2), "c-gruen", -1, "token", "111-111"),
    buchung("b-system", zeit(0, 3), "c-gruen", 1, "system", "wartung"),
  ]).run();

  // DRK-297, Aufgabe 11 — eigener Artikel mit Bestand im Handlager UND im
  // Fahrzeug: H-1 liegt nur im Handlager, R-9 nur im RTW, GF-1 nur hinter
  // dem LvD-Schrank, LEER ist komplett wieder herausgebucht.
  t.db.insert(lagerorte).values([
    { id: RTW1, name: "RTW 1", typ: "fahrzeug", kennung: "MS-DRK-1", aktiv: true },
    {
      id: SCHRANK_GF, name: "GF-Schrank", typ: "lager", parentId: HANDLAGER_ID,
      zugangshinweis: "Zugang über LvD — anrufen", sortierung: 90, aktiv: true,
    },
  ]).run();
  t.db.insert(artikel).values({
    id: ARTIKEL_A,
    name: "Verbandmull",
    einheit: "Pkg.",
    fach: "B-2",
    mindestbestand: 3,
    aktiv: true,
    createdAt: NOW,
  }).run();
  t.db.insert(chargen).values([
    { id: "c-h1", artikelId: ARTIKEL_A, chargenNr: "H-1", verfall: "2027-01", createdAt: NOW },
    { id: "c-r9", artikelId: ARTIKEL_A, chargenNr: "R-9", verfall: "2027-01", createdAt: NOW },
    { id: "c-gf1", artikelId: ARTIKEL_A, chargenNr: "GF-1", verfall: "2027-01", createdAt: NOW },
    { id: "c-leer-a", artikelId: ARTIKEL_A, chargenNr: "LEER", verfall: "2027-01", createdAt: NOW },
    // Liegt in BEIDEN: dem GF-Schrank (sortierung 90) UND dem RTW (sortierung
    // 0 als Fahrzeug-Default). Ohne den Rang VOR der Sortierung stuende das
    // Fahrzeug faelschlich zuerst.
    { id: "c-mix", artikelId: ARTIKEL_A, chargenNr: "MIX", verfall: "2027-01", createdAt: NOW },
  ]).run();
  t.db.insert(buchungen).values([
    { id: "b-h1", ts: zeit(-8), typ: "zugang", artikelId: ARTIKEL_A, chargeId: "c-h1",
      lagerortId: HANDLAGER_ID, menge: 5, quelleTyp: "system", quelleId: "import" },
    { id: "b-r9", ts: zeit(-8), typ: "zugang", artikelId: ARTIKEL_A, chargeId: "c-r9",
      lagerortId: RTW1, menge: 7, quelleTyp: "system", quelleId: "import" },
    { id: "b-gf1", ts: zeit(-8), typ: "zugang", artikelId: ARTIKEL_A, chargeId: "c-gf1",
      lagerortId: SCHRANK_GF, menge: 3, quelleTyp: "system", quelleId: "import" },
    { id: "b-leer-a-rein", ts: zeit(-8), typ: "zugang", artikelId: ARTIKEL_A, chargeId: "c-leer-a",
      lagerortId: HANDLAGER_ID, menge: 2, quelleTyp: "system", quelleId: "import" },
    { id: "b-leer-a-raus", ts: zeit(-7), typ: "entnahme", artikelId: ARTIKEL_A, chargeId: "c-leer-a",
      lagerortId: HANDLAGER_ID, menge: -2, quelleTyp: "system", quelleId: "import" },
    { id: "b-mix-gf", ts: zeit(-8), typ: "zugang", artikelId: ARTIKEL_A, chargeId: "c-mix",
      lagerortId: SCHRANK_GF, menge: 4, quelleTyp: "system", quelleId: "import" },
    { id: "b-mix-rtw", ts: zeit(-8), typ: "zugang", artikelId: ARTIKEL_A, chargeId: "c-mix",
      lagerortId: RTW1, menge: 6, quelleTyp: "system", quelleId: "import" },
  ]).run();
});

afterEach(() => {
  t.schliessen();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

function wert<T>(ergebnis: unknown): T {
  return (ergebnis as { ok: true; wert: T }).wert;
}

describe("getDetail", () => {
  it("laesst den Admin-Riegel vor jedem Datenbankzugriff entscheiden", async () => {
    const verweigert = new Error("Kein Lagerbuch-Zugang");
    adminRiegel.mockRejectedValueOnce(verweigert);
    const unerreichbareDb = new Proxy({}, {
      get: () => { throw new Error("Datenbank wurde vor dem Riegel beruehrt"); },
    }) as DB;

    await expect(getDetail("a1", unerreichbareDb)).rejects.toBe(verweigert);

    expect(adminRiegel).toHaveBeenCalledTimes(1);
    expect(revalidiert).toEqual([]);
  });

  it("liefert eine unbekannte ID als normalen Fehler ohne Revalidierung", async () => {
    const ergebnis = await getDetail("fehlt", t.db);

    expect(ergebnis).toEqual({ ok: false, fehler: "Artikel nicht gefunden." });
    expect(revalidiert).toEqual([]);
  });

  it("mappt Stammdaten und nur positive Chargen nach Verfall mit serverseitigem Ampeltext", async () => {
    const ergebnis = await getDetail("a1", t.db);
    const detail = wert<{
      artikel: unknown;
      chargen: unknown[];
      historie: unknown[];
      mehrVorhanden: boolean;
    }>(ergebnis);

    expect(detail.artikel).toEqual({
      id: "a1",
      name: "Kompressen steril",
      einheit: "Stk",
      fach: "A1",
      mindestbestand: 20,
      aktiv: true,
      bestand: 12,
      kategorie: null,
    });
    const nurHandlager = (menge: number) =>
      [{
        id: HANDLAGER_ID, name: "Handlager", menge, zugangshinweis: null,
        // Das Handlager ist ein Lager — `standortMeta` sagt dort „Lager",
        // nicht „nicht zugeordnet" (DRK-309).
        typ: "lager" as const, kennung: null, einheitenart: null,
      }];
    expect(detail.chargen).toEqual([
      { id: "c-rot", chargenNr: "ROT", verfall: "2026-06", rest: 2,
        restGesamt: 2, orte: nurHandlager(2), ampel: "rot", text: "läuft 06/26 ab" },
      { id: "c-gelb", chargenNr: "GELB", verfall: "2026-07", rest: 3,
        restGesamt: 3, orte: nurHandlager(3), ampel: "gelb", text: "fällig 07/26" },
      { id: "c-gruen", chargenNr: "GRUEN", verfall: "2027-03", rest: 7,
        restGesamt: 7, orte: nurHandlager(7), ampel: "gruen", text: "bis 03/27" },
    ]);
    expect(revalidiert).toEqual([]);
  });

  it("bewahrt die dreistufige FEFO-Reihenfolge ohne createdAt im Action-Ergebnis", async () => {
    const alt = new Date("2026-01-01T00:00:00Z");
    const neu = new Date("2026-01-02T00:00:00Z");
    const gleich = new Date("2026-01-03T00:00:00Z");
    t.db.insert(chargen).values([
      { id: "aaa-neu", artikelId: "a1", chargenNr: "NEU", verfall: "2026-01", createdAt: neu },
      { id: "zzz-alt", artikelId: "a1", chargenNr: "ALT", verfall: "2026-01", createdAt: alt },
      { id: "bbb-gleich", artikelId: "a1", chargenNr: "ID-B", verfall: "2026-01", createdAt: gleich },
      { id: "aaa-gleich", artikelId: "a1", chargenNr: "ID-A", verfall: "2026-01", createdAt: gleich },
    ]).run();
    t.db.insert(buchungen).values([
      { id: "b-neu", ts: neu, typ: "zugang", artikelId: "a1", chargeId: "aaa-neu",
        lagerortId: HANDLAGER_ID, menge: 1, quelleTyp: "system", quelleId: "test" },
      { id: "b-alt", ts: alt, typ: "zugang", artikelId: "a1", chargeId: "zzz-alt",
        lagerortId: HANDLAGER_ID, menge: 1, quelleTyp: "system", quelleId: "test" },
      { id: "b-gleich-b", ts: gleich, typ: "zugang", artikelId: "a1", chargeId: "bbb-gleich",
        lagerortId: HANDLAGER_ID, menge: 1, quelleTyp: "system", quelleId: "test" },
      { id: "b-gleich-a", ts: gleich, typ: "zugang", artikelId: "a1", chargeId: "aaa-gleich",
        lagerortId: HANDLAGER_ID, menge: 1, quelleTyp: "system", quelleId: "test" },
    ]).run();

    const detail = wert<{ chargen: Array<{ id: string }> }>(await getDetail("a1", t.db));
    const gleichesVerfallsdatum = detail.chargen.filter((charge) =>
      ["aaa-neu", "zzz-alt", "bbb-gleich", "aaa-gleich"].includes(charge.id));

    expect(gleichesVerfallsdatum.map((charge) => charge.id))
      .toEqual(["zzz-alt", "aaa-neu", "aaa-gleich", "bbb-gleich"]);
    expect(gleichesVerfallsdatum[0]).not.toHaveProperty("createdAt");
  });

  it("behaelt Verlaufslimit, Reihenfolge, IDs, Quellenaufloesung und mehrVorhanden", async () => {
    const prepare = vi.spyOn(t.sqlite, "prepare");

    const detail = wert<{
      historie: Array<{ id: string; quelleName: string }>;
      mehrVorhanden: boolean;
    }>(await getDetail("a1", t.db));

    expect(detail.historie).toHaveLength(ARTIKEL_VERLAUF_GRENZE);
    expect(detail.historie.slice(0, 3)).toMatchObject([
      { id: "b-system", quelleName: "System" },
      { id: "b-token", quelleName: "RTW 1 Karte" },
      { id: "b-oidc", quelleName: "Anna Verwaltung" },
    ]);
    expect(detail.mehrVorhanden).toBe(true);

    const verlaufSql = prepare.mock.calls
      .map(([sql]) => String(sql))
      .filter((sql) => sql.includes("from \"buchungen\"")
        && sql.includes("order by \"buchungen\".\"ts\" desc"));
    expect(verlaufSql).toHaveLength(1);
    expect(verlaufSql[0]).toContain("limit ?");
    expect(revalidiert).toEqual([]);
  });
});

describe("getDetail: Verteilung einer Charge ueber mehrere Orte (DRK-297, Aufgabe 11)", () => {
  /** DER BEFUND AUS DEM TICKET: 5 im Handlager, 7 im RTW — angezeigt wurden
   *  Bestand 5 und EINE Charge. */
  it("zeigt eine Charge, die vollstaendig im Fahrzeug liegt", async () => {
    const e = await getDetail(ARTIKEL_A, t.db);
    const chargen = (e as { wert: { chargen: ArtikelDetailCharge[] } }).wert.chargen;
    expect(chargen.map((c) => c.chargenNr)).toContain("R-9");
  });

  it("nennt je Charge Ort und Menge", async () => {
    const e = await getDetail(ARTIKEL_A, t.db);
    const charge = (e as { wert: { chargen: ArtikelDetailCharge[] } }).wert.chargen
      .find((c) => c.chargenNr === "R-9");
    expect(charge?.orte).toEqual([{
      id: RTW1, name: "RTW 1", menge: 7, zugangshinweis: null,
      // DRK-309: Die Spalte „Liegt in" benennt den Ort. `RTW 1` traegt hier
      // KEINE Art — der Zwischenstand aus Migration 0010 —, die Anzeige sagt
      // deshalb „nicht zugeordnet" statt „Fahrzeug" zu behaupten.
      typ: "fahrzeug", kennung: "MS-DRK-1", einheitenart: null,
    }]);
    expect(charge?.restGesamt).toBe(7);
  });

  it("reicht den Zugangshinweis des Orts mit", async () => {
    const e = await getDetail(ARTIKEL_A, t.db);
    const charge = (e as { wert: { chargen: ArtikelDetailCharge[] } }).wert.chargen
      .find((c) => c.chargenNr === "GF-1");
    expect(charge?.orte[0]?.zugangshinweis).toBe("Zugang über LvD — anrufen");
  });

  /** Eine leergebuchte Charge bleibt draussen — sonst fuellte jede je gebuchte
   *  Charge die Tabelle. */
  it("laesst eine Charge ohne Rest an irgendeinem Ort weg", async () => {
    const e = await getDetail(ARTIKEL_A, t.db);
    expect((e as { wert: { chargen: ArtikelDetailCharge[] } }).wert.chargen
      .map((c) => c.chargenNr)).not.toContain("LEER");
  });

  /**
   * ⚠️ `sortierung` ALLEIN REICHT NICHT: das RTW traegt den Fahrzeug-Default 0
   * und stuende damit VOR dem GF-Schrank (sortierung 90). Der Rang
   * (Handlager-Bereich vor Fahrzeugen) entscheidet ZUERST.
   */
  it("stellt den Handlager-Bereich vor Fahrzeugen, auch wenn die Sortierung anders liefe", async () => {
    const e = await getDetail(ARTIKEL_A, t.db);
    const charge = (e as { wert: { chargen: ArtikelDetailCharge[] } }).wert.chargen
      .find((c) => c.chargenNr === "MIX");
    expect(charge?.orte).toEqual([
      {
        id: SCHRANK_GF, name: "GF-Schrank", menge: 4,
        zugangshinweis: "Zugang über LvD — anrufen",
        // Ein Lager sagt „Lager", nicht „nicht zugeordnet" (`standortMeta`).
        typ: "lager", kennung: null, einheitenart: null,
      },
      {
        id: RTW1, name: "RTW 1", menge: 6, zugangshinweis: null,
        typ: "fahrzeug", kennung: "MS-DRK-1", einheitenart: null,
      },
    ]);
    expect(charge?.restGesamt).toBe(10);
  });
});
