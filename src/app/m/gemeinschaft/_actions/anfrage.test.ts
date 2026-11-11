import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb, type TestDb } from "../_lib/testDb";

/* IDA-341: Turnstile an der Bar-Anfrage — Reihenfolge der Schranken und Wiederholung einer Sendung. */

const h = vi.hoisted(() => ({
  db: null as unknown as TestDb,
  turnstile: vi.fn<(token: string, aktion: string) => Promise<boolean>>(async () => true),
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/core/auth", () => ({ auth: async () => null }));
vi.mock("@/core/turnstile/server", () => ({ pruefeTurnstile: h.turnstile }));
vi.mock("../_lib/zugang", () => ({ requireGemeinschaftHostAktion: async () => {} }));
vi.mock("../_db/client", () => ({ getDb: () => h.db }));

import { anfrageSendenAction } from "./anfrage";

const SENDUNG = "0b6f7c1e-3d2a-4c55-9a8e-1f2e3d4c5b6a";
const eingabe = (mehr: Record<string, unknown> = {}) => ({
  vonTag: "2026-12-05", vonUhr: "18:00", bisTag: "2026-12-05", bisUhr: "23:00", anlass: "Geburtstag", personen: "30",
  person: "Gast Beispiel", kontakt: "0151 2345678", hinweis: "", webseite: "", ...mehr,
});

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2026-11-10T12:00:00Z"), toFake: ["Date"] });
  h.db = testDb();
  h.turnstile.mockReset();
  h.turnstile.mockResolvedValue(true);
});
afterEach(() => vi.useRealTimers());

describe("anfrageSendenAction mit Turnstile (IDA-341)", () => {
  it("prüft das Token mit der Aktion der Bar und legt die Anfrage an", async () => {
    const r = await anfrageSendenAction(eingabe({ sendung: SENDUNG, turnstile: "tok" }));
    expect(r.ok).toBe(true);
    expect(h.turnstile).toHaveBeenCalledWith("tok", "bar_anfrage");
  });

  it("speichert nichts, wenn die Prüfung scheitert", async () => {
    h.turnstile.mockResolvedValue(false);
    const r = await anfrageSendenAction(eingabe({ sendung: SENDUNG, turnstile: "tok" }));
    expect(r).toEqual({ ok: false, fehler: expect.stringContaining("automatische Einsendungen") });
    h.turnstile.mockResolvedValue(true);
    expect((await anfrageSendenAction(eingabe({ sendung: SENDUNG, turnstile: "neu" }))).ok).toBe(true);
  });

  it("gibt einer schon angelegten Sendung ihren Statuslink, ohne erneut zu prüfen", async () => {
    const erst = await anfrageSendenAction(eingabe({ sendung: SENDUNG, turnstile: "tok" }));
    h.turnstile.mockClear();
    h.turnstile.mockResolvedValue(false);
    const noch = await anfrageSendenAction(eingabe({ sendung: SENDUNG, turnstile: "tok" }));
    expect(noch).toEqual(erst);
    expect(h.turnstile).not.toHaveBeenCalled();
  });

  it("verbraucht den Zähler je Absender nicht für Sendungen ohne gültiges Token", async () => {
    h.turnstile.mockResolvedValue(false);
    for (let i = 0; i < 20; i++) await anfrageSendenAction(eingabe({ turnstile: "falsch" }));
    h.turnstile.mockResolvedValue(true);
    expect((await anfrageSendenAction(eingabe({ sendung: SENDUNG, turnstile: "tok" }))).ok).toBe(true);
  });

  it("fragt beim Honigtopf nicht bei Cloudflare nach", async () => {
    const r = await anfrageSendenAction(eingabe({ webseite: "http://spam.example" }));
    expect(r.ok).toBe(true);
    expect(h.turnstile).not.toHaveBeenCalled();
  });
});
