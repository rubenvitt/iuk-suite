import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import type Database from "better-sqlite3";
import * as schema from "@/app/m/feedback/_db/schema";
import { setzeSchritt, starteOderHoleRunde } from "@/app/m/feedback/_db/quiz";
import { frischeDb, JETZT, mkQuiz, params, type TestDb } from "@/app/m/feedback/_lib/quiz/test-hilfen";
import type { BeamerSicht } from "@/app/m/feedback/_lib/quiz/sichten";

let sqlite: Database.Database;
let db: TestDb;
vi.mock("@/app/m/feedback/_db/client", () => ({ getDb: () => db }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-host": "feedback.example", "x-forwarded-proto": "https" }),
}));
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
vi.mock("next/navigation", () => ({ notFound: () => notFound() }));

beforeEach(() => {
  ({ sqlite, db } = frischeDb());
  vi.useFakeTimers({ now: JETZT });
});
afterEach(() => {
  vi.useRealTimers();
  sqlite.close();
});

type Props = { anfang: BeamerSicht; beitrittAdresse: string };
async function props(secret: string): Promise<Props> {
  const { default: Seite } = await import("./page");
  const el = (await Seite(params({ secret }))) as ReactElement<Props>;
  return el.props;
}

describe("beamer/[secret] page", () => {
  it("ohne Runde von heute: vorStart, und das Laden legt nichts an (§5.3)", async () => {
    const q = mkQuiz(db);
    const p = await props(q.moderationSecret);
    expect(p.anfang.phase).toEqual({ art: "vorStart" });
    expect(p.beitrittAdresse).toBe("feedback.example/q");
    expect(db.select().from(schema.quizRunden).all()).toHaveLength(0);
    expect(db.select().from(schema.evenings).all()).toHaveLength(0);
  });

  it("mit Runde: deren serialisierbare Sicht", async () => {
    const q = mkQuiz(db);
    const r = starteOderHoleRunde(db, q, JETZT);
    setzeSchritt(db, r.id, 1, JETZT);
    const p = await props(q.moderationSecret);
    expect(p.anfang).toMatchObject({ phase: { art: "frage" }, beitrittCode: r.beitrittCode });
    expect(JSON.parse(JSON.stringify(p.anfang))).toEqual(p.anfang);
  });

  it("unbekanntes oder zu langes Secret: notFound", async () => {
    await expect(props("falsch")).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(props("x".repeat(500))).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
