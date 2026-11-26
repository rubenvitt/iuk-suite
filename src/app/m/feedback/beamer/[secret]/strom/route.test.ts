import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/app/m/feedback/_db/schema";
import { starteOderHoleRunde } from "@/app/m/feedback/_db/quiz";
import {
  frischeDb,
  get,
  JETZT,
  mkQuiz,
  naechstesEreignis,
  params,
  post,
  type TestDb,
} from "@/app/m/feedback/_lib/quiz/test-hilfen";
import type Database from "better-sqlite3";
import type { BeamerSicht } from "@/app/m/feedback/_lib/quiz/sichten";

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

const zeilen = () => ({
  runden: db.select().from(schema.quizRunden).all().length,
  abende: db.select().from(schema.evenings).all().length,
});

describe("GET beamer/[secret]/strom", () => {
  it("legt keine Runde und keinen Abend an und zeigt vorStart", async () => {
    const q = mkQuiz(db);
    const vorher = zeilen();
    const { GET } = await import("./route");
    const ac = new AbortController();
    const res = await GET(
      get(`/beamer/${q.moderationSecret}/strom`, {}, ac.signal),
      params({ secret: q.moderationSecret }),
    );
    expect(res.headers.get("content-type")).toBe(
      "text/event-stream; charset=utf-8",
    );
    const e = await naechstesEreignis(res.body!.getReader());
    expect((e!.daten as BeamerSicht).phase).toEqual({ art: "vorStart" });
    expect((e!.daten as BeamerSicht).titel).toBe("Funk");
    expect(zeilen()).toEqual(vorher);
    expect(vorher).toEqual({ runden: 0, abende: 0 });
    ac.abort();
  });

  it("falsches Secret → 404", async () => {
    mkQuiz(db);
    const { GET } = await import("./route");
    const res = await GET(
      get("/beamer/falsch/strom"),
      params({ secret: "falsch" }),
    );
    expect(res.status).toBe(404);
  });

  it("zeigt die laufende Runde und wechselt ohne Neuverbinden auf die Runde des ersten Schritts", async () => {
    const q = mkQuiz(db);
    const { GET } = await import("./route");
    const { POST } = await import("../schritt/route");
    const ac = new AbortController();
    const res = await GET(
      get("/x", {}, ac.signal),
      params({ secret: q.moderationSecret }),
    );
    const r = res.body!.getReader();
    expect(((await naechstesEreignis(r))!.daten as BeamerSicht).phase.art).toBe(
      "vorStart",
    );
    const antwort = await POST(
      post("/x", { schritt: 0 }),
      params({ secret: q.moderationSecret }),
    );
    expect(antwort.status).toBe(200);
    vi.advanceTimersByTime(250);
    const sicht = (await naechstesEreignis(r))!.daten as BeamerSicht;
    expect(sicht.phase.art).toBe("lobby");
    expect(sicht.beitrittCode).toMatch(/^[A-Z2-9]{6}$/);
    ac.abort();
  });

  it("holt das Auto-Ende nach: die Runde von gestern ist danach beendet", async () => {
    const q = mkQuiz(db);
    const gestern = new Date("2026-11-24T18:00:00Z");
    const alt = starteOderHoleRunde(db, q, gestern);
    const { GET } = await import("./route");
    const ac = new AbortController();
    const res = await GET(
      get("/x", {}, ac.signal),
      params({ secret: q.moderationSecret }),
    );
    const e = await naechstesEreignis(res.body!.getReader());
    expect((e!.daten as BeamerSicht).phase.art).toBe("vorStart");
    const runde = db
      .select()
      .from(schema.quizRunden)
      .all()
      .find((x) => x.id === alt.id)!;
    expect(runde.beendetAt).not.toBeNull();
    expect(db.select().from(schema.quizRunden).all()).toHaveLength(1);
    ac.abort();
  });
});
