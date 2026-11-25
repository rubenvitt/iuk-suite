import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/app/m/feedback/_db/schema";
import { beendeRunde, starteOderHoleRunde } from "@/app/m/feedback/_db/quiz";
import { tokenHash } from "@/app/m/feedback/_lib/quiz/codes";
import {
  cookieAus,
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

let ip = 0;
beforeEach(() => {
  ({ sqlite, db } = frischeDb());
  vi.useFakeTimers({ now: JETZT });
  ip++;
});
afterEach(() => {
  vi.useRealTimers();
  sqlite.close();
});

async function beitritt(
  code: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  const { POST } = await import("./route");
  return POST(
    post(`/q/${code}/beitritt`, body, {
      "cf-connecting-ip": `10.0.0.${ip}`,
      ...headers,
    }),
    params({ code }),
  );
}

describe("POST q/[code]/beitritt", () => {
  it("tritt bei, setzt das Cookie der Runde und speichert nur den Hash", async () => {
    const r = starteOderHoleRunde(db, mkQuiz(db), JETZT);
    const res = await beitritt(r.beitrittCode.toLowerCase(), {
      spitzname: "Anna",
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ ok: true });
    const kopf = res.headers.get("set-cookie")!;
    expect(kopf).toMatch(new RegExp(`^iuk-quiz-${r.id}=[A-Za-z0-9_-]{43};`));
    expect(kopf).toMatch(/HttpOnly/i);
    expect(kopf).toMatch(/SameSite=lax/i);
    expect(kopf).toMatch(/Path=\//);
    expect(kopf).toMatch(/Max-Age=43200/);
    const token = cookieAus(res).split("=")[1];
    const t = db.select().from(schema.quizTeilnahmen).all();
    expect(t).toHaveLength(1);
    expect(t[0].tokenHash).toBe(tokenHash(token));
    expect(t[0].tokenHash).not.toBe(token);
  });

  it("mit gültigem Cookie: ok ohne zweite Teilnahme (Review Focus 2)", async () => {
    const r = starteOderHoleRunde(db, mkQuiz(db), JETZT);
    const erst = await beitritt(r.beitrittCode, { spitzname: "Anna" });
    const zweit = await beitritt(
      r.beitrittCode,
      { spitzname: "Anna" },
      { cookie: cookieAus(erst) },
    );
    expect(zweit.status).toBe(200);
    expect(zweit.headers.get("set-cookie")).toBeNull();
    expect(db.select().from(schema.quizTeilnahmen).all()).toHaveLength(1);
  });

  it("Spitzname fehlt oder vergeben → 400 mit Grund", async () => {
    const r = starteOderHoleRunde(db, mkQuiz(db), JETZT);
    expect(await (await beitritt(r.beitrittCode, {})).json()).toEqual({
      fehler: "spitzname_fehlt",
    });
    await beitritt(r.beitrittCode, { spitzname: "Anna" });
    const res = await beitritt(r.beitrittCode, { spitzname: "anna" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ fehler: "spitzname_vergeben" });
  });

  it("Lagebild: leerer Body genügt", async () => {
    const r = starteOderHoleRunde(db, mkQuiz(db, "lagebild"), JETZT);
    expect((await beitritt(r.beitrittCode, "")).status).toBe(200);
  });

  it("weist kaputte Bodies mit 400 ab", async () => {
    const r = starteOderHoleRunde(db, mkQuiz(db), JETZT);
    for (const body of [
      "{",
      [],
      { spitzname: 5 },
      { spitzname: "x".repeat(101) },
      { spitzname: "Anna", x: 1 },
    ]) {
      expect(
        (await beitritt(r.beitrittCode, body)).status,
        JSON.stringify(body),
      ).toBe(400);
    }
  });

  it("unbekannter oder beendeter Code → 404", async () => {
    const r = starteOderHoleRunde(db, mkQuiz(db), JETZT);
    expect((await beitritt("ZZZZZZ", { spitzname: "Anna" })).status).toBe(404);
    beendeRunde(db, r.id, JETZT);
    expect((await beitritt(r.beitrittCode, { spitzname: "Anna" })).status).toBe(
      404,
    );
  });

  it("drosselt nach 10 Beitritten je Minute und Adresse (429)", async () => {
    const r = starteOderHoleRunde(db, mkQuiz(db, "lagebild"), JETZT);
    for (let i = 0; i < 10; i++)
      expect((await beitritt(r.beitrittCode, {})).status).toBe(200);
    expect((await beitritt(r.beitrittCode, {})).status).toBe(429);
    vi.advanceTimersByTime(60_001);
    expect((await beitritt(r.beitrittCode, {})).status).toBe(200);
  });
});
