import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  antworte,
  beendeRunde,
  setzeSchritt,
  starteOderHoleRunde,
  tritteBei,
} from "@/app/m/feedback/_db/quiz";
import {
  frischeDb,
  get,
  JETZT,
  mkQuiz,
  naechstesEreignis,
  params,
  type TestDb,
} from "@/app/m/feedback/_lib/quiz/test-hilfen";
import { meldeRunde } from "@/app/m/feedback/_lib/quiz/stand";
import type Database from "better-sqlite3";
import type { HandySicht } from "@/app/m/feedback/_lib/quiz/sichten";

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

async function strom(code: string, cookie?: string) {
  const { GET } = await import("./route");
  const ac = new AbortController();
  const res = await GET(
    get(`/q/${code}/strom`, cookie ? { cookie } : {}, ac.signal),
    params({ code }),
  );
  return { res, ac };
}

describe("GET q/[code]/strom", () => {
  it("verrät während der Frage die Lösung nicht", async () => {
    const r = starteOderHoleRunde(db, mkQuiz(db), JETZT);
    setzeSchritt(db, r.id, 1, JETZT);
    const { res, ac } = await strom(r.beitrittCode);
    const e = await naechstesEreignis(res.body!.getReader());
    expect((e!.daten as HandySicht).phase.art).toBe("frage");
    expect(e!.roh).not.toContain('"richtig"');
    ac.abort();
  });

  it("ohne Cookie: keine eigene Antwort; mit Cookie: die eigene", async () => {
    const r = starteOderHoleRunde(db, mkQuiz(db), JETZT);
    setzeSchritt(db, r.id, 1, JETZT);
    const t = tritteBei(db, r, { token: "tok", spitzname: "Anna" });
    if (!("teilnahmeId" in t)) throw new Error("kein Beitritt");
    antworte(db, r, t.teilnahmeId, 0, [2], JETZT);
    const ohne = await strom(r.beitrittCode);
    expect(
      (
        (await naechstesEreignis(ohne.res.body!.getReader()))!
          .daten as HandySicht
      ).eigeneAntwort,
    ).toBeUndefined();
    const mit = await strom(r.beitrittCode, `iuk-quiz-${r.id}=tok`);
    expect(
      (
        (await naechstesEreignis(mit.res.body!.getReader()))!
          .daten as HandySicht
      ).eigeneAntwort,
    ).toEqual([2]);
    ohne.ac.abort();
    mit.ac.abort();
  });

  it("unbekannter oder beendeter Code → 404", async () => {
    const r = starteOderHoleRunde(db, mkQuiz(db), JETZT);
    expect((await strom("ZZZZZZ")).res.status).toBe(404);
    beendeRunde(db, r.id, JETZT);
    expect((await strom(r.beitrittCode)).res.status).toBe(404);
  });

  it("sendet ende und schließt, wenn die Runde endet", async () => {
    const r = starteOderHoleRunde(db, mkQuiz(db), JETZT);
    const { res } = await strom(r.beitrittCode);
    const leser = res.body!.getReader();
    await naechstesEreignis(leser);
    beendeRunde(db, r.id, JETZT);
    meldeRunde(r);
    vi.advanceTimersByTime(250);
    expect((await naechstesEreignis(leser))!.roh).toBe(
      "event: ende\ndata: {}\n\n",
    );
    expect(await naechstesEreignis(leser)).toBeNull();
  });
});
