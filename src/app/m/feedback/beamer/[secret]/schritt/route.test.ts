import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/app/m/feedback/_db/schema";
import { insertEvening } from "@/app/m/feedback/_db/queries";
import {
  frischeDb,
  JETZT,
  mkQuiz,
  params,
  post,
  type TestDb,
} from "@/app/m/feedback/_lib/quiz/test-hilfen";
import type Database from "better-sqlite3";
import type { BeamerSicht } from "@/app/m/feedback/_lib/quiz/sichten";
import { abonniere } from "@/app/m/feedback/_lib/quiz/verteiler";

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

async function schritt(secret: string, body: unknown) {
  const { POST } = await import("./route");
  return POST(post(`/beamer/${secret}/schritt`, body), params({ secret }));
}

describe("POST beamer/[secret]/schritt", () => {
  it("legt beim ersten Aufruf die Runde an, danach dieselbe (zwei Tabs)", async () => {
    const q = mkQuiz(db);
    const a = await schritt(q.moderationSecret, { schritt: 0 });
    expect(a.status).toBe(200);
    expect(a.headers.get("cache-control")).toBe("no-store");
    expect(((await a.json()) as BeamerSicht).phase.art).toBe("lobby");
    const b = await schritt(q.moderationSecret, { schritt: 1 });
    const sicht = (await b.json()) as BeamerSicht;
    expect(sicht.phase).toMatchObject({ art: "frage", index: 0, offen: true });
    expect(sicht.frage?.richtig).toBeUndefined();
    await schritt(q.moderationSecret, { schritt: 1 });
    expect(db.select().from(schema.quizRunden).all()).toHaveLength(1);
  });

  it("falsches Secret → 404, ohne etwas anzulegen", async () => {
    mkQuiz(db);
    expect((await schritt("falsch", { schritt: 0 })).status).toBe(404);
    expect(db.select().from(schema.quizRunden).all()).toHaveLength(0);
  });

  it("weist kaputte Bodies mit 400 ab", async () => {
    const q = mkQuiz(db);
    for (const body of [
      "{",
      [],
      { schritt: "1" },
      { schritt: 1.5 },
      { schritt: -1 },
      { schritt: 1, x: 1 },
      {},
      "null",
    ]) {
      expect(
        (await schritt(q.moderationSecret, body)).status,
        JSON.stringify(body),
      ).toBe(400);
    }
    expect(db.select().from(schema.quizRunden).all()).toHaveLength(0);
  });

  it("abgesagter Abend von heute → 409 tag_belegt", async () => {
    const q = mkQuiz(db);
    insertEvening(db, {
      groupId: q.groupId,
      date: new Date("2026-11-25T00:00:00Z"),
      topic: null,
      notes: null,
      participantCount: null,
      createdAt: JETZT,
      status: "cancelled",
    });
    const res = await schritt(q.moderationSecret, { schritt: 0 });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ fehler: "tag_belegt" });
  });

  it("ein Entwurf ohne Fragen → 409 fragen_ungueltig", async () => {
    const q = mkQuiz(db, "lagebild", []);
    const res = await schritt(q.moderationSecret, { schritt: 0 });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ fehler: "fragen_ungueltig" });
  });

  it("meldet nach Ablauf von zeit_s von selbst („Zeit um“ ohne Schreiben)", async () => {
    const q = mkQuiz(db);
    await schritt(q.moderationSecret, { schritt: 1 });
    const runde = db.select().from(schema.quizRunden).get()!;
    const h = vi.fn();
    const ab = abonniere(runde.id, h)!;
    vi.advanceTimersByTime(19_000);
    expect(h).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1_500);
    expect(h).toHaveBeenCalledTimes(1);
    ab();
  });

  it("drosselt nach 120 Schritten je Minute (429)", async () => {
    const q = mkQuiz(db);
    for (let i = 0; i < 120; i++)
      expect(
        (await schritt(q.moderationSecret, { schritt: i % 2 })).status,
      ).toBe(200);
    expect((await schritt(q.moderationSecret, { schritt: 0 })).status).toBe(
      429,
    );
  });
});
