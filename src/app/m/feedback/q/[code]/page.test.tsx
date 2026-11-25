import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import type Database from "better-sqlite3";
import { beendeRunde, setzeSchritt, starteOderHoleRunde, tritteBei } from "@/app/m/feedback/_db/quiz";
import { frischeDb, JETZT, mkQuiz, params, type TestDb } from "@/app/m/feedback/_lib/quiz/test-hilfen";
import { meldeRunde } from "@/app/m/feedback/_lib/quiz/stand";
import type { HandySicht } from "@/app/m/feedback/_lib/quiz/sichten";

let sqlite: Database.Database;
let db: TestDb;
let keks: Record<string, string> = {};
vi.mock("@/app/m/feedback/_db/client", () => ({ getDb: () => db }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (n: string) => (n in keks ? { name: n, value: keks[n] } : undefined) }),
}));

beforeEach(() => {
  ({ sqlite, db } = frischeDb());
  keks = {};
  vi.useFakeTimers({ now: JETZT });
});
afterEach(() => {
  vi.useRealTimers();
  sqlite.close();
});

async function anfang(code: string): Promise<HandySicht | null> {
  const { default: Seite } = await import("./page");
  const el = (await Seite(params({ code }))) as ReactElement<{ anfang: HandySicht | null }>;
  return el.props.anfang;
}

describe("q/[code] page", () => {
  it("unbekannter oder beendeter Code: `null` (Zustand „Quiz ist beendet“), kein Fehler", async () => {
    expect(await anfang("ZZZZZZ")).toBeNull();
    expect(await anfang("X".repeat(200))).toBeNull();
    const r = starteOderHoleRunde(db, mkQuiz(db), JETZT);
    beendeRunde(db, r.id, JETZT);
    expect(await anfang(r.beitrittCode)).toBeNull();
  });

  it("gibt eine serialisierbare Sicht weiter, mit der Teilnahme aus dem Cookie", async () => {
    const r = starteOderHoleRunde(db, mkQuiz(db), JETZT);
    setzeSchritt(db, r.id, 1, JETZT);
    const ohne = await anfang(r.beitrittCode.toLowerCase());
    expect(ohne).toMatchObject({ dabei: false, phase: { art: "frage" } });
    expect(JSON.parse(JSON.stringify(ohne))).toEqual(ohne);

    tritteBei(db, r, { token: "tok", spitzname: "Anna" });
    meldeRunde(r); // wie der Beitrittsweg: Stand verwerfen
    keks = { [`iuk-quiz-${r.id}`]: "tok" };
    expect(await anfang(r.beitrittCode)).toMatchObject({ dabei: true });
  });
});
