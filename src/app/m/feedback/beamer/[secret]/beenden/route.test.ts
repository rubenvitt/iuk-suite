import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/app/m/feedback/_db/schema";
import { starteOderHoleRunde, tritteBei } from "@/app/m/feedback/_db/quiz";
import {
  frischeDb,
  JETZT,
  mkQuiz,
  params,
  post,
  type TestDb,
} from "@/app/m/feedback/_lib/quiz/test-hilfen";
import type Database from "better-sqlite3";

let sqlite: Database.Database;
let db: TestDb;
vi.mock("@/app/m/feedback/_db/client", () => ({ getDb: () => db }));

beforeEach(() => {
  ({ sqlite, db } = frischeDb());
  vi.useFakeTimers({ now: JETZT });
});
afterEach(() => {
  vi.useRealTimers();
  sqlite.close();
});

async function beenden(secret: string) {
  const { POST } = await import("./route");
  return POST(post(`/beamer/${secret}/beenden`, ""), params({ secret }));
}

describe("POST beamer/[secret]/beenden", () => {
  it("beendet die offene Runde: beendet_at gesetzt, token_hash NULL", async () => {
    const q = mkQuiz(db);
    const r = starteOderHoleRunde(db, q, JETZT);
    tritteBei(db, r, { token: "t", spitzname: "Anna" });
    const res = await beenden(q.moderationSecret);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(db.select().from(schema.quizRunden).get()!.beendetAt).toBe(
      JETZT.getTime(),
    );
    expect(db.select().from(schema.quizTeilnahmen).get()!.tokenHash).toBeNull();
  });

  it("ohne Runde: 200 und nichts angelegt", async () => {
    const q = mkQuiz(db);
    expect((await beenden(q.moderationSecret)).status).toBe(200);
    expect(db.select().from(schema.quizRunden).all()).toHaveLength(0);
  });

  it("falsches Secret → 404", async () => {
    const q = mkQuiz(db);
    starteOderHoleRunde(db, q, JETZT);
    expect((await beenden("falsch")).status).toBe(404);
    expect(db.select().from(schema.quizRunden).get()!.beendetAt).toBeNull();
  });
});
