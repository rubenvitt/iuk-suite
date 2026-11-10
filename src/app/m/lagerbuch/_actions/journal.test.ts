import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import { artikel, buchungen, chargen, lagerorte } from "../_db/schema";
import { HANDLAGER_ID } from "../_lib/konstanten";

/**
 * IDA-378 — „GEGENBUCHEN" IM JOURNAL. Die Mechanik selbst ist in
 * `_lib/schreibpfade/gegenbuchung.test.ts` geprueft; hier steht, was nur die
 * Action beantwortet: der Riegel, die Quelle der Gegenzeilen und dass der
 * Server den Vorgang aus EINER Zeile selbst aufloest.
 */
const { adminRiegel } = vi.hoisted(() => ({ adminRiegel: vi.fn<() => Promise<unknown>>() }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("../_lib/zugang", () => ({ requireLagerbuchAdmin: () => adminRiegel() }));
vi.mock("../_db/client", () => ({
  getDb: () => { throw new Error("getDb() im Test — jeder Aufruf uebergibt t.db"); },
}));

import { gegenbucheVorgang } from "./journal";

const JETZT = new Date("2026-10-15T10:00:00Z");
const S1 = "11111111-1111-4111-8111-111111111111";
let t: TestDb;

beforeEach(() => {
  adminRiegel.mockResolvedValue({ sub: "u-admin", groups: ["lagerbuch"], name: "A. Verwaltung", email: null });
  t = migrierteTestDb("lagerbuch-actions-journal-");
  t.db.insert(lagerorte).values({ id: "fz-1", name: "RTW 1", typ: "fahrzeug", aktiv: true }).run();
  t.db.insert(artikel).values({ id: "a1", name: "Mullbinde", einheit: "Stk", fach: "A1",
    mindestbestand: 0, aktiv: true, createdAt: JETZT }).run();
  t.db.insert(chargen).values({ id: "c1", artikelId: "a1", chargenNr: "L1", verfall: "2028-01", createdAt: JETZT }).run();
  const zeile = (id: string, typ: "zugang" | "umlagerung" | "korrektur", ort: string, menge: number, referenz: string | null) => ({
    id, ts: JETZT, typ, artikelId: "a1", chargeId: "c1", lagerortId: ort, menge,
    quelleTyp: "token" as const, quelleId: "482-137", referenz, kommentar: null,
  });
  t.db.insert(buchungen).values([
    zeile("seed", "zugang", HANDLAGER_ID, 10, null),
    zeile(`${S1}:0`, "umlagerung", HANDLAGER_ID, -4, "entnahme-ziel:fz-1"),
    zeile(`${S1}:1`, "umlagerung", "fz-1", 4, "entnahme-ziel:fz-1"),
    zeile("check-1", "korrektur", HANDLAGER_ID, -1, "check:c1"),
  ]).run();
});
afterEach(() => { t.schliessen(); vi.clearAllMocks(); });

const bestand = (ort: string) => t.db.select().from(buchungen).all()
  .filter((b) => b.lagerortId === ort).reduce((s, b) => s + b.menge, 0);

describe("gegenbucheVorgang", () => {
  it("bucht aus EINER genannten Zeile den ganzen Vorgang gegen — mit der Person als Quelle", async () => {
    const erg = await gegenbucheVorgang({ zeilenIds: [`${S1}:1`] }, t.db);
    expect(erg).toEqual({ ok: true, wert: { gegengebucht: 2, ids: [`${S1}:0`, `${S1}:1`] } });
    // 10 − 1 (Check) − 4 (Umlagerung) + 4 (Gegenbuchung): der Check bleibt stehen.
    expect(bestand(HANDLAGER_ID)).toBe(9);
    expect(bestand("fz-1")).toBe(0);
    const gegen = t.db.select().from(buchungen).all().filter((b) => b.id.startsWith("storno:"));
    expect(gegen.every((b) => b.quelleTyp === "oidc" && b.quelleId === "u-admin")).toBe(true);
  });

  it("weist eine Zeile ab, die nicht zum Vorgang der ersten gehoert", async () => {
    const erg = await gegenbucheVorgang({ zeilenIds: [`${S1}:0`, "seed"] }, t.db);
    expect(erg).toEqual({ ok: false, fehler: "Diesen Vorgang gibt es nicht." });
    expect(bestand(HANDLAGER_ID)).toBe(5);
  });

  it("weist einen Check-Vorgang ab", async () => {
    const erg = await gegenbucheVorgang({ zeilenIds: ["check-1"] }, t.db);
    expect(erg).toEqual({ ok: false, fehler: "Dieser Vorgang lässt sich nicht gegenbuchen." });
  });

  it("weist ein zweites Gegenbuchen mit dem fachlichen Satz ab", async () => {
    await gegenbucheVorgang({ zeilenIds: [`${S1}:0`] }, t.db);
    const erg = await gegenbucheVorgang({ zeilenIds: [`${S1}:0`] }, t.db);
    expect(erg).toEqual({ ok: false, fehler: "Dieser Vorgang ist schon gegengebucht." });
  });

  it("der Riegel steht vor allem anderen", async () => {
    adminRiegel.mockRejectedValue(new Error("NEXT_NOT_FOUND"));
    await expect(gegenbucheVorgang({ zeilenIds: [`${S1}:0`] }, t.db)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(t.db.select().from(buchungen).all()).toHaveLength(4);
  });

  it("eine unbrauchbare Nutzlast bucht nichts", async () => {
    expect(await gegenbucheVorgang({ zeilenIds: [] }, t.db)).toMatchObject({ ok: false });
    expect(await gegenbucheVorgang({ zeilenIds: ["gibt-es-nicht"] }, t.db)).toMatchObject({ ok: false });
  });
});
