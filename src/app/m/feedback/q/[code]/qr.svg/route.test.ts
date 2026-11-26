import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";
import { beendeRunde, starteOderHoleRunde } from "@/app/m/feedback/_db/quiz";
import { frischeDb, get, JETZT, mkQuiz, params, type TestDb } from "@/app/m/feedback/_lib/quiz/test-hilfen";
import { PROBE_JE_MINUTE, probeGrenze } from "@/app/m/feedback/_lib/quiz/grenzen";

let sqlite: Database.Database;
let db: TestDb;
const qrSvg = vi.fn(async (text: string) => `<svg data-text="${text}"></svg>`);
vi.mock("@/app/m/feedback/_db/client", () => ({ getDb: () => db }));
vi.mock("@/core/qr", () => ({ qrSvg: (t: string) => qrSvg(t) }));

beforeEach(() => {
  ({ sqlite, db } = frischeDb());
  qrSvg.mockClear();
  vi.useFakeTimers({ now: JETZT });
});
afterEach(() => {
  vi.useRealTimers();
  sqlite.close();
});

const kopf = { "x-forwarded-host": "feedback.example", "x-forwarded-proto": "https", host: "intern:3000" };

describe("GET q/[code]/qr.svg", () => {
  it("QR auf die Handy-Adresse am öffentlichen Host, als SVG und nie zwischengespeichert", async () => {
    const r = starteOderHoleRunde(db, mkQuiz(db), JETZT);
    const { GET } = await import("./route");
    const res = await GET(get(`/q/${r.beitrittCode}/qr.svg`, kopf), params({ code: r.beitrittCode.toLowerCase() }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/svg+xml");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(qrSvg).toHaveBeenCalledWith(`https://feedback.example/q/${r.beitrittCode}`);
    expect(await res.text()).toContain("<svg");
  });

  it("unbekannter, zu langer oder beendeter Code: 404 ohne QR", async () => {
    const r = starteOderHoleRunde(db, mkQuiz(db), JETZT);
    beendeRunde(db, r.id, JETZT);
    const { GET } = await import("./route");
    for (const code of ["ZZZZZZ", "X".repeat(200), r.beitrittCode]) {
      expect((await GET(get(`/q/${code}/qr.svg`, kopf), params({ code }))).status).toBe(404);
    }
    expect(qrSvg).not.toHaveBeenCalled();
  });

  it("Code-Orakel: Fehlgriffe zählen gegen die Probegrenze, auch gesperrt bleibt es 404 (nie 429)", async () => {
    const { GET } = await import("./route");
    const ip = "10.9.2.1";
    const mitIp = { ...kopf, "cf-connecting-ip": ip };
    for (let i = 0; i < PROBE_JE_MINUTE; i++) {
      const code = i % 2 ? "ZZZZZZ" : "X".repeat(200);
      expect((await GET(get(`/q/${code}/qr.svg`, mitIp), params({ code }))).status).toBe(404);
    }
    expect(probeGrenze.istGesperrt(ip)).toBe(true);
    expect((await GET(get("/q/ZZZZZZ/qr.svg", mitIp), params({ code: "ZZZZZZ" }))).status).toBe(404);
    expect(qrSvg).not.toHaveBeenCalled();
  });
});
