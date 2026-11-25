import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";
import * as schema from "@/app/m/feedback/_db/schema";
import { starteOderHoleRunde } from "@/app/m/feedback/_db/quiz";
import { frischeDb, JETZT, mkQuiz, type TestDb } from "./test-hilfen";
import { quizAutoEndeBeimStart } from "./autoEnde";

let sqlite: Database.Database;
let db: TestDb | null;
vi.mock("@/app/m/feedback/_db/client", () => ({
  getDb: () => {
    if (!db) throw new Error("keine Datenbank");
    return db;
  },
}));

beforeEach(() => {
  const f = frischeDb();
  sqlite = f.sqlite;
  db = f.db;
});
afterEach(() => sqlite.close());

describe("quizAutoEndeBeimStart", () => {
  it("beendet beim Start die Runde von gestern", () => {
    const alt = starteOderHoleRunde(
      db!,
      mkQuiz(db!),
      new Date("2026-11-24T18:00:00Z"),
    );
    expect(quizAutoEndeBeimStart(JETZT)).toBe(1);
    const r = db!
      .select()
      .from(schema.quizRunden)
      .all()
      .find((x) => x.id === alt.id)!;
    expect(r.beendetAt).toBe(JETZT.getTime());
  });

  it("wirft nie: ein Fehler wird protokolliert, der Start läuft weiter", () => {
    const fehler = vi.spyOn(console, "error").mockImplementation(() => {});
    db = null;
    expect(quizAutoEndeBeimStart(JETZT)).toBe(0);
    expect(fehler).toHaveBeenCalledTimes(1);
    fehler.mockRestore();
  });
});
