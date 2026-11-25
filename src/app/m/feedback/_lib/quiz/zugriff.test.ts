import { registerAuditFunctions } from "@/core/audit/context";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import * as schema from "@/app/m/feedback/_db/schema";
import { insertGroup } from "@/app/m/feedback/_db/queries";
import { legeQuizAn, rundenStand, starteOderHoleRunde } from "@/app/m/feedback/_db/quiz";

/**
 * `ladeAuswertung` EINMAL JE REQUEST: Layout und Seite rufen es mit je eigenem `params`-Promise.
 * Außerhalb einer RSC-Anfrage merkt sich React `cache()` nichts; hier steht ein Merker an seiner
 * Stelle, der wie der echte nach den Argumenten unterscheidet. Geprüft wird so, dass der
 * Schlüssel die URL-Teile sind und nicht das Promise.
 */
vi.mock("react", async (orig) => {
  const echt = await orig<typeof import("react")>();
  return {
    ...echt,
    cache: <A extends unknown[], R>(fn: (...a: A) => R) => {
      const gemerkt = new Map<string, R>();
      return (...a: A) => {
        const k = JSON.stringify(a);
        if (!gemerkt.has(k)) gemerkt.set(k, fn(...a));
        return gemerkt.get(k)!;
      };
    },
  };
});
const { guardPageMock } = vi.hoisted(() => ({ guardPageMock: vi.fn() }));
vi.mock("@/app/m/feedback/_lib/guardPage", () => ({ guardPage: guardPageMock }));
vi.mock("@/app/m/feedback/_db/client", () => ({ getDb: () => db }));
vi.mock("@/app/m/feedback/_db/quiz", async (orig) => {
  const echt = await orig<typeof import("@/app/m/feedback/_db/quiz")>();
  return { ...echt, rundenStand: vi.fn(echt.rundenStand) };
});
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound()");
  },
}));

import { ladeAuswertung } from "./zugriff";

let sqlite: Database.Database;
let db: ReturnType<typeof drizzle<typeof schema>>;
const JETZT = new Date("2026-11-25T18:00:00Z");

beforeEach(() => {
  sqlite = new Database(":memory:");
  registerAuditFunctions(sqlite);
  sqlite.pragma("foreign_keys = ON");
  db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "src/app/m/feedback/_db/migrations" });
  guardPageMock.mockReset();
  guardPageMock.mockImplementation(async () => ({ viewer: null, db, memberIds: [] }));
  vi.mocked(rundenStand).mockClear();
});
afterEach(() => sqlite.close());

describe("ladeAuswertung", () => {
  it("liest bei zwei Aufrufen mit eigenen params-Promises nur einmal", async () => {
    const g = insertGroup(db, { name: "g", slug: "g", secret: "abc12", closeAfterHours: null, createdAt: new Date(0) });
    const q = legeQuizAn(db, {
      groupId: g.id,
      titel: "Funk",
      modus: "lagebild",
      fragen: [{ text: "?", typ: "einfach", optionen: ["A", "B"], richtig: [0] }],
      jetzt: JETZT,
    });
    const r = starteOderHoleRunde(db, q, JETZT);
    const params = () => Promise.resolve({ groupId: String(g.id), eveningId: String(r.eveningId), rundeId: String(r.id) });
    const a = await ladeAuswertung(params());
    const b = await ladeAuswertung(params());
    expect(b).toBe(a);
    expect(rundenStand).toHaveBeenCalledTimes(1);
    expect(guardPageMock).toHaveBeenCalledTimes(1);
  });
});
