import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/app/m/feedback/_db/schema";
import {
  setzeSchritt,
  starteOderHoleRunde,
  tritteBei,
} from "@/app/m/feedback/_db/quiz";
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

let n = 0;
function laufendeFrage() {
  const r = starteOderHoleRunde(db, mkQuiz(db), JETZT);
  setzeSchritt(db, r.id, 1, JETZT);
  const token = `token-${++n}`;
  tritteBei(db, r, { token, spitzname: "Anna" });
  return { r, cookie: `iuk-quiz-${r.id}=${token}` };
}

async function antwort(code: string, body: unknown, cookie?: string) {
  const { POST } = await import("./route");
  return POST(
    post(`/q/${code}/antwort`, body, cookie ? { cookie } : {}),
    params({ code }),
  );
}

describe("POST q/[code]/antwort", () => {
  it("nimmt die Antwort an und weist die zweite als doppelt ab", async () => {
    const { r, cookie } = laufendeFrage();
    const ok = await antwort(
      r.beitrittCode,
      { frageIndex: 0, gewaehlt: [1] },
      cookie,
    );
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toBe("no-store");
    expect(db.select().from(schema.quizAntworten).all()).toHaveLength(1);
    const doppelt = await antwort(
      r.beitrittCode,
      { frageIndex: 0, gewaehlt: [2] },
      cookie,
    );
    expect(doppelt.status).toBe(409);
    expect(await doppelt.json()).toEqual({ fehler: "doppelt" });
  });

  it("während der Auflösung → 409 geschlossen", async () => {
    const { r, cookie } = laufendeFrage();
    setzeSchritt(db, r.id, 2, JETZT);
    const res = await antwort(
      r.beitrittCode,
      { frageIndex: 0, gewaehlt: [1] },
      cookie,
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ fehler: "geschlossen" });
  });

  it("nach Ablauf von zeit_s → 409 geschlossen (Serverzeit, Review Focus 4)", async () => {
    const { r, cookie } = laufendeFrage();
    vi.advanceTimersByTime(21_000);
    expect(
      await (
        await antwort(r.beitrittCode, { frageIndex: 0, gewaehlt: [1] }, cookie)
      ).json(),
    ).toEqual({ fehler: "geschlossen" });
  });

  it("ohne Cookie oder mit fremdem Token → 401", async () => {
    const { r } = laufendeFrage();
    expect(
      (await antwort(r.beitrittCode, { frageIndex: 0, gewaehlt: [1] })).status,
    ).toBe(401);
    expect(
      (
        await antwort(
          r.beitrittCode,
          { frageIndex: 0, gewaehlt: [1] },
          `iuk-quiz-${r.id}=fremd`,
        )
      ).status,
    ).toBe(401);
  });

  it("weist kaputte Bodies mit 400 ab", async () => {
    const { r, cookie } = laufendeFrage();
    for (const body of [
      "{",
      { frageIndex: "0", gewaehlt: [1] },
      { frageIndex: 0, gewaehlt: 1 },
      { frageIndex: 0, gewaehlt: [] },
      { frageIndex: 0, gewaehlt: [1.5] },
      { frageIndex: 0, gewaehlt: ["1"] },
      { frageIndex: 0, gewaehlt: [0, 1, 2, 3, 4, 5, 6] },
      { frageIndex: -1, gewaehlt: [1] },
      { frageIndex: 0, gewaehlt: [1], x: 1 },
      { frageIndex: 0, gewaehlt: [7] },
    ]) {
      expect(
        (await antwort(r.beitrittCode, body, cookie)).status,
        JSON.stringify(body),
      ).toBe(400);
    }
    expect(db.select().from(schema.quizAntworten).all()).toHaveLength(0);
  });

  it("unbekannter Code → 404", async () => {
    const { cookie } = laufendeFrage();
    expect(
      (await antwort("ZZZZZZ", { frageIndex: 0, gewaehlt: [1] }, cookie))
        .status,
    ).toBe(404);
  });

  it("drosselt nach 60 Antworten je Minute und Token (429)", async () => {
    const { r, cookie } = laufendeFrage();
    for (let i = 0; i < 60; i++)
      expect(
        (
          await antwort(
            r.beitrittCode,
            { frageIndex: 1, gewaehlt: [0] },
            cookie,
          )
        ).status,
      ).toBe(409);
    expect(
      (await antwort(r.beitrittCode, { frageIndex: 1, gewaehlt: [0] }, cookie))
        .status,
    ).toBe(429);
  });
});
