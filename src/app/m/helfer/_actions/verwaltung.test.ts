import { beforeEach, describe, expect, it, vi } from "vitest";
import { testDb as neueDb, type TestDb } from "../_lib/testDb";

/** Die Rechte an den Zugangs-Actions für Lifeline Hub (LLH-1194): nur Verwaltende auf dem Modul-Host. */
let nutzer: { id: string; name: string; groups: string[] } | null = null;
let host = "helfer.localtest.me";
let db: TestDb;
vi.mock("@/core/auth", () => ({ auth: async () => (nutzer ? { user: nutzer } : null) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../_db/client", () => ({ getDb: () => db }));

import { listeZugaenge } from "../_lib/schluessel";
import { zugangAnlegenAction, zugangWiderrufenAction } from "./verwaltung";

const VERWALTUNG = { id: "sub-v", name: "Vera Verwaltung", groups: ["helfer-nutzer", "helfer-admin"] };

beforeEach(() => {
  db = neueDb();
  nutzer = VERWALTUNG;
  host = "helfer.localtest.me";
});

describe("Zugang für Lifeline Hub", () => {
  it("ohne Verwaltungsrecht oder auf fremdem Host: Forbidden, und nichts ist angelegt", async () => {
    nutzer = { ...VERWALTUNG, groups: ["helfer-nutzer"] };
    await expect(zugangAnlegenAction("Lifeline Hub")).rejects.toThrow("Forbidden");
    nutzer = VERWALTUNG;
    host = "radio.localtest.me";
    await expect(zugangAnlegenAction("Lifeline Hub")).rejects.toThrow("Forbidden");
    await expect(zugangWiderrufenAction("x")).rejects.toThrow("Forbidden");
    expect(listeZugaenge(db)).toEqual([]);
  });

  it("legt an, gibt den Schlüssel genau einmal heraus und widerruft", async () => {
    const r = await zugangAnlegenAction("  Lifeline Hub  ");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.wert.schluessel).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const [z] = listeZugaenge(db);
    expect(z.bezeichnung).toBe("Lifeline Hub");
    expect(z.angelegtVon).toBe("Vera Verwaltung");
    expect(await zugangWiderrufenAction(z.id)).toEqual({ ok: true });
    expect((await zugangWiderrufenAction(z.id)).ok).toBe(false);
  });

  it("eine leere oder zu lange Bezeichnung wird abgelehnt", async () => {
    expect((await zugangAnlegenAction("  ")).ok).toBe(false);
    expect((await zugangAnlegenAction("x".repeat(81))).ok).toBe(false);
    expect(listeZugaenge(db)).toEqual([]);
  });
});
