import { describe, it, expect } from "vitest";
import { computeDAStats, computeGroupTrend } from "./aggregation";
import type { Question } from "./questions";

const Q: Question[] = [
  { id: "q1", type: "schulnote", text: "Insgesamt?" },
  { id: "q9", type: "text", text: "Bestes?" },
];

describe("computeDAStats", () => {
  it("mittelt Ratings, sammelt Freitexte, zählt Antworten", () => {
    const stats = computeDAStats(Q, [
      { q1: 2, q9: "super" },
      { q1: 4, q9: "" },
      { q1: 3 },
    ]);
    expect(stats.responseCount).toBe(3);
    const q1 = stats.perQuestion.find((p) => p.id === "q1")!;
    expect(q1.avg).toBeCloseTo(3); // (2+4+3)/3
    expect(q1.count).toBe(3);
    expect(stats.overallAvg).toBeCloseTo(3);
    const q9 = stats.texts.find((t) => t.questionId === "q9")!;
    expect(q9.values).toEqual(["super"]); // leere Strings raus
  });

  it("wertet stars aus Alt-Umfragen aus (nicht ignorieren)", () => {
    const qs: Question[] = [{ id: "q1", type: "stars", text: "Bewertung?" }];
    const stats = computeDAStats(qs, [{ q1: 5 }, { q1: 3 }]);
    expect(stats.perQuestion[0].avg).toBeCloseTo(4);
  });

  it("avg null bei fehlenden Ratings", () => {
    const stats = computeDAStats(Q, [{ q9: "nur text" }]);
    expect(stats.perQuestion.find((p) => p.id === "q1")!.avg).toBeNull();
    expect(stats.overallAvg).toBeNull();
  });

  it("liest Rating als json.Number-String tolerant", () => {
    const stats = computeDAStats(Q, [{ q1: "2" }, { q1: "4" }]);
    expect(stats.perQuestion.find((p) => p.id === "q1")!.avg).toBeCloseTo(3);
  });
});

describe("computeGroupTrend", () => {
  const utc = (y: number, m: number, d: number) => Math.floor(Date.UTC(y, m - 1, d) / 1000);
  const st = (avg: number | null, count: number): ReturnType<typeof computeDAStats> => ({
    perQuestion: [],
    overallAvg: avg,
    texts: [],
    responseCount: count,
  });

  it("bucketet nach Monat, füllt leere Monate mit avg=null", () => {
    const trend = computeGroupTrend(
      [
        { date: utc(2026, 1, 10), stats: st(2, 5) },
        { date: utc(2026, 3, 5), stats: st(4, 3) },
      ],
      utc(2026, 1, 1),
      utc(2026, 3, 31),
    );
    expect(trend.map((p) => p.label)).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(trend[0].avg).toBeCloseTo(2);
    expect(trend[1].avg).toBeNull(); // Februar leer
    expect(trend[2].avg).toBeCloseTo(4);
  });

  it("Range inklusiv an den Grenzen (kein off-by-one)", () => {
    const trend = computeGroupTrend(
      [{ date: utc(2026, 1, 31), stats: st(3, 1) }],
      utc(2026, 1, 1),
      utc(2026, 1, 31),
    );
    expect(trend).toHaveLength(1);
    expect(trend[0].avg).toBeCloseTo(3);
  });

  it("mittelt mehrere Dienstabende im selben Monat gewichtet nach responseCount", () => {
    const trend = computeGroupTrend(
      [
        { date: utc(2026, 1, 5), stats: st(2, 1) },
        { date: utc(2026, 1, 20), stats: st(4, 3) },
      ],
      utc(2026, 1, 1),
      utc(2026, 1, 31),
    );
    // (2*1 + 4*3) / (1+3) = 3.5
    expect(trend[0].avg).toBeCloseTo(3.5);
    expect(trend[0].responseCount).toBe(4);
  });
});
