import { describe, it, expect } from "vitest";
import { computeDAStats, computeGroupTrend, shuffleStable } from "./aggregation";
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

/**
 * Der stille Rechenfehler (Entwurf 1.5/5, Entscheidung 4.12): `overallAvg` mischt
 * Schulnoten (1–6) und Alt-Sterne (1–5) in DENSELBEN Mittelwert. Ein 1–5-Ø von 4,2
 * würde in der Ampel wie eine Schulnote 4,2 eingefärbt — also gelb-rot, obwohl 4,2
 * von 5 eine gute Bewertung ist. `avgSchulnote` ist der Wert, den jede
 * Ampeldarstellung liest; `overallAvg` bleibt für die CSV-Kompatibilität, wie er ist.
 */
describe("computeDAStats: getrennter Schulnoten-Mittelwert (gemischte Skalen)", () => {
  const gemischt: Question[] = [
    { id: "q1", type: "schulnote", text: "Insgesamt?" },
    { id: "q2", type: "schulnote", text: "Thema?" },
    { id: "s1", type: "stars", text: "Alt-Bewertung?" },
    { id: "q9", type: "text", text: "Bestes?" },
  ];

  it("mittelt in avgSchulnote nur die schulnote-Fragen und meldet hasLegacyScale", () => {
    // schulnote: q1 Ø 2, q2 Ø 3 → avgSchulnote 2,5. stars: s1 Ø 5 — nicht darin.
    const stats = computeDAStats(gemischt, [
      { q1: 2, q2: 3, s1: 5 },
      { q1: 2, q2: 3, s1: 5 },
    ]);
    expect(stats.avgSchulnote).toBeCloseTo(2.5);
    expect(stats.hasLegacyScale).toBe(true);
    // overallAvg bleibt unangetastet: (2 + 3 + 5) / 3 — bewusst bedeutungslos,
    // aber CSV-kompatibel.
    expect(stats.overallAvg).toBeCloseTo(10 / 3);
  });

  it("reiner stars-Fragebogen: avgSchulnote ist null, overallAvg wie bisher", () => {
    const qs: Question[] = [{ id: "s1", type: "stars", text: "Bewertung?" }];
    const stats = computeDAStats(qs, [{ s1: 5 }, { s1: 3 }]);
    expect(stats.avgSchulnote).toBeNull();
    expect(stats.hasLegacyScale).toBe(true);
    expect(stats.overallAvg).toBeCloseTo(4);
  });

  it("reiner Schulnoten-Fragebogen: hasLegacyScale false, avgSchulnote == overallAvg", () => {
    const stats = computeDAStats(Q, [{ q1: 2 }, { q1: 4 }]);
    expect(stats.hasLegacyScale).toBe(false);
    expect(stats.avgSchulnote).toBeCloseTo(3);
    expect(stats.overallAvg).toBeCloseTo(3);
  });

  it("stars-Frage ohne Antworten: hasLegacyScale bleibt true (der Bogen enthält sie)", () => {
    const stats = computeDAStats(gemischt, [{ q1: 1, q2: 1 }]);
    expect(stats.hasLegacyScale).toBe(true);
    expect(stats.avgSchulnote).toBeCloseTo(1);
  });

  it("gemischter Bogen ohne Schulnoten-Antworten: avgSchulnote null, overallAvg gesetzt", () => {
    const stats = computeDAStats(gemischt, [{ s1: 4 }]);
    expect(stats.avgSchulnote).toBeNull();
    expect(stats.overallAvg).toBeCloseTo(4);
  });
});

describe("computeGroupTrend", () => {
  const utc = (y: number, m: number, d: number) => Math.floor(Date.UTC(y, m - 1, d) / 1000);
  const st = (avg: number | null, count: number): ReturnType<typeof computeDAStats> => ({
    perQuestion: [],
    overallAvg: avg,
    avgSchulnote: avg,
    hasLegacyScale: false,
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

/**
 * Anonymität (Entwurf 3.9): die Leseordnung darf die Eingangsreihenfolge nicht
 * verraten — bei 15 Personen ist "wer zuerst ging, steht oben" allein ein
 * Deanonymisierungskanal.
 */
describe("shuffleStable", () => {
  /** 15 unterscheidbare Antworten — die realistische Gruppengröße. */
  const fifteen = Array.from({ length: 15 }, (_, i) => ({
    q1: (i % 6) + 1,
    q9: `Antwort ${i + 1}`,
  }));
  const keyOf = (a: Record<string, unknown>) => JSON.stringify(a);

  it("ist deterministisch: gleiche Eingabe → identische Reihenfolge", () => {
    const a = shuffleStable(fifteen, keyOf);
    const b = shuffleStable(fifteen, keyOf);
    expect(a.map(keyOf)).toEqual(b.map(keyOf));
  });

  it("ist nicht die Identität: 15 Antworten kommen in anderer Reihenfolge heraus", () => {
    const out = shuffleStable(fifteen, keyOf);
    expect(out.map(keyOf)).not.toEqual(fifteen.map(keyOf));
  });

  it("erhält alle Elemente (keins verloren, keins doppelt) und lässt die Eingabe unberührt", () => {
    const before = fifteen.map(keyOf);
    const out = shuffleStable(fifteen, keyOf);
    expect(out).toHaveLength(15);
    expect(out.map(keyOf).sort()).toEqual([...before].sort());
    expect(new Set(out.map(keyOf)).size).toBe(15);
    expect(fifteen.map(keyOf)).toEqual(before); // nicht in-place sortiert
  });

  it("ordnet identische Antwort-JSONs nach demselben Schlüssel zusammen", () => {
    const dupes = [{ q1: 2 }, { q1: 3 }, { q1: 2 }];
    const out = shuffleStable(dupes, keyOf);
    expect(out).toHaveLength(3);
    expect(out.map(keyOf).filter((k) => k === JSON.stringify({ q1: 2 }))).toHaveLength(2);
  });
});

describe("computeDAStats: Durchmischung ändert die Auswertung nicht", () => {
  const fifteen = Array.from({ length: 15 }, (_, i) => ({
    q1: (i % 6) + 1,
    q9: `Antwort ${i + 1}`,
  }));

  it("liefert dieselben Durchschnitte wie vor der Durchmischung", () => {
    const stats = computeDAStats(Q, fifteen);
    const expected = fifteen.reduce((s, a) => s + a.q1, 0) / fifteen.length;
    expect(stats.perQuestion.find((p) => p.id === "q1")!.avg).toBeCloseTo(expected);
    expect(stats.overallAvg).toBeCloseTo(expected);
    expect(stats.responseCount).toBe(15);
    expect(stats.perQuestion.find((p) => p.id === "q1")!.count).toBe(15);
  });

  it("gibt Freitexte in der Ordnung von shuffleStable aus, nicht in Eingangsreihenfolge", () => {
    const stats = computeDAStats(Q, fifteen);
    const values = stats.texts.find((t) => t.questionId === "q9")!.values;
    // Dieselbe Ordnung, die die CSV-Route über shuffleStable herstellt.
    expect(values).toEqual(
      shuffleStable(fifteen, (a) => JSON.stringify(a)).map((a) => a.q9),
    );
    expect(values).not.toEqual(fifteen.map((a) => a.q9));
    expect([...values].sort()).toEqual(fifteen.map((a) => a.q9).sort());
  });
});
