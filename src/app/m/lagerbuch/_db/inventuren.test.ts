import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { migrierteTestDb, type TestDb } from "./testdb";
import { artikel, inventuren, inventurPositionen } from "./schema";

const JETZT = new Date("2026-09-14T10:00:00Z");
let t: TestDb;

beforeEach(() => {
  t = migrierteTestDb("lagerbuch-inventuren-");
  t.db.insert(artikel).values({
    id: "art-1", name: "Mullbinde", einheit: "Stk.", fach: "A1",
    mindestbestand: 0, aktiv: true, createdAt: JETZT,
  }).run();
  t.db.insert(inventuren).values({
    id: "lauf-1", ts: JETZT, quelleTyp: "oidc", quelleId: "u-admin",
    kommentar: "Quartal", umfang: null,
  }).run();
  t.db.insert(inventurPositionen).values({
    id: "pos-1", inventurId: "lauf-1", artikelId: "art-1", chargeId: null,
    erwartet: 5, gezaehlt: 4,
  }).run();
});
afterEach(() => t.schliessen());

describe("0006 — Inventurlaeufe sind append-only", () => {
  it("verbietet UPDATE und DELETE auf beiden Tabellen", () => {
    expect(() => t.db.update(inventuren).set({ kommentar: "x" }).where(eq(inventuren.id, "lauf-1")).run())
      .toThrow(/append-only/);
    expect(() => t.db.delete(inventuren).where(eq(inventuren.id, "lauf-1")).run())
      .toThrow(/append-only/);
    expect(() => t.db.update(inventurPositionen).set({ gezaehlt: 9 }).where(eq(inventurPositionen.id, "pos-1")).run())
      .toThrow(/append-only/);
    expect(() => t.db.delete(inventurPositionen).where(eq(inventurPositionen.id, "pos-1")).run())
      .toThrow(/append-only/);
  });

  it("verlangt einen existierenden Lauf", () => {
    expect(() => t.db.insert(inventurPositionen).values({
      id: "pos-2", inventurId: "gibt-es-nicht", artikelId: "art-1", chargeId: null,
      erwartet: 0, gezaehlt: 0,
    }).run()).toThrow(/FOREIGN KEY/i);
  });
});
