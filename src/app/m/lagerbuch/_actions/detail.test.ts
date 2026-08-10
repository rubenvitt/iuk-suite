import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DB } from "../_db/client";
import { artikel, buchungen, chargen, tokens, users } from "../_db/schema";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import { ARTIKEL_VERLAUF_GRENZE } from "../_lib/grenzen";
import { HANDLAGER_ID } from "../_lib/konstanten";

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

import { getDetail } from "./detail";

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
    });
    expect(detail.chargen).toEqual([
      { id: "c-rot", chargenNr: "ROT", verfall: "2026-06", rest: 2,
        ampel: "rot", text: "läuft 06/26 ab" },
      { id: "c-gelb", chargenNr: "GELB", verfall: "2026-07", rest: 3,
        ampel: "gelb", text: "fällig 07/26" },
      { id: "c-gruen", chargenNr: "GRUEN", verfall: "2027-03", rest: 7,
        ampel: "gruen", text: "bis 03/27" },
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
