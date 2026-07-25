import { describe, it, expect } from "vitest";
import {
  computeDAStats,
  computeGroupTrend,
  shuffleStable,
  verteilungJeFrage,
} from "./aggregation";
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
  /**
   * Ein Abend als Attrappe mit ABSICHTLICH VERSCHIEDENEN Mittelwerten: `note` ist
   * der Schulnoten-Ø (den die Kurve lesen MUSS), `gemischt` der bedeutungslose
   * Mischwert aus 1–6 und 1–5 (`overallAvg`).
   *
   * Die erste Fassung dieser Attrappe setzte beide Felder auf denselben Wert —
   * damit bestand jede Erwartung unten auch dann, wenn die Kurve den falschen
   * Wert liest, und `avgSchulnote: null` hätte hier nichts rot gemacht. Genau
   * das war der Beweis, dass `avgSchulnote` keinen Leser hatte.
   */
  const st = (
    note: number | null,
    gemischt: number | null,
    count: number,
    altbestand = false,
  ): ReturnType<typeof computeDAStats> => ({
    perQuestion: [],
    overallAvg: gemischt,
    avgSchulnote: note,
    hasLegacyScale: altbestand,
    texts: [],
    responseCount: count,
  });

  it("bucketet nach Monat, füllt leere Monate mit avg=null", () => {
    const trend = computeGroupTrend(
      [
        { date: utc(2026, 1, 10), stats: st(2, 5.5, 5) },
        { date: utc(2026, 3, 5), stats: st(4, 1.5, 3) },
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
      [{ date: utc(2026, 1, 31), stats: st(3, 4.75, 1) }],
      utc(2026, 1, 1),
      utc(2026, 1, 31),
    );
    expect(trend).toHaveLength(1);
    expect(trend[0].avg).toBeCloseTo(3);
  });

  it("mittelt mehrere Dienstabende im selben Monat gewichtet nach responseCount", () => {
    const trend = computeGroupTrend(
      [
        { date: utc(2026, 1, 5), stats: st(2, 5, 1) },
        { date: utc(2026, 1, 20), stats: st(4, 1, 3) },
      ],
      utc(2026, 1, 1),
      utc(2026, 1, 31),
    );
    // (2*1 + 4*3) / (1+3) = 3.5 — aus den SCHULNOTEN. Aus `overallAvg` wären es
    // (5*1 + 1*3) / 4 = 2.0.
    expect(trend[0].avg).toBeCloseTo(3.5);
    expect(trend[0].responseCount).toBe(4);
  });

  it("gewichtet mit avgSchulnote, nicht mit dem gemischten overallAvg", () => {
    // Ein Bogen mit Alt-Frage: Schulnote 1,0 („sehr gut"), Sterne 5 von 5 —
    // `overallAvg` mittelt beide zu 3,0 („befriedigend"). Die Kurve muss 1,0
    // zeigen; 3,0 wäre die still falsch eingefärbte Ampel aus §4.12.
    const trend = computeGroupTrend(
      [{ date: utc(2026, 5, 6), stats: st(1, 3, 12, true) }],
      utc(2026, 5, 1),
      utc(2026, 5, 31),
    );
    expect(trend[0].avg).toBeCloseTo(1);
    expect(trend[0].hasLegacyScale).toBe(true);
  });

  it("ein Abend ohne Schulnotenfrage fällt aus der Kurve, bleibt aber gezählt", () => {
    // Reiner Altbestands-Bogen: `avgSchulnote` ist null, `overallAvg` 4,2 (von
    // 5!). Läse die Kurve `overallAvg`, stünde dort „ausreichend" für einen
    // Abend, der gut bewertet wurde.
    const trend = computeGroupTrend(
      [{ date: utc(2026, 5, 6), stats: st(null, 4.2, 7, true) }],
      utc(2026, 5, 1),
      utc(2026, 5, 31),
    );
    expect(trend[0].avg).toBeNull();
    expect(trend[0].responseCount).toBe(7); // die Rückmeldungen gab es
    expect(trend[0].hasLegacyScale).toBe(true);
  });

  it("verfälscht den Monats-Ø nicht mit dem Abend ohne Schulnote", () => {
    const trend = computeGroupTrend(
      [
        { date: utc(2026, 5, 6), stats: st(2, 2, 1) },
        { date: utc(2026, 5, 20), stats: st(null, 4.5, 3, true) },
      ],
      utc(2026, 5, 1),
      utc(2026, 5, 31),
    );
    // Nur der Abend MIT Schulnote trägt den Ø: 2,0 — nicht (2*1 + 4,5*3)/4 = 3,875.
    expect(trend[0].avg).toBeCloseTo(2);
    expect(trend[0].responseCount).toBe(4);
    expect(trend[0].hasLegacyScale).toBe(true);
  });

  it("meldet hasLegacyScale nur, wo ein Altbestands-Bogen im Bucket liegt", () => {
    const trend = computeGroupTrend(
      [
        { date: utc(2026, 1, 5), stats: st(2, 2, 4) },
        { date: utc(2026, 3, 5), stats: st(2, 3, 4, true) },
      ],
      utc(2026, 1, 1),
      utc(2026, 3, 31),
    );
    expect(trend[0].hasLegacyScale).toBe(false);
    expect(trend[1].hasLegacyScale).toBe(false); // leerer Februar
    expect(trend[2].hasLegacyScale).toBe(true);
  });
});

/**
 * DIE FRAGEN-Ø JE MONAT — Grundlage der zuschaltbaren Fragekurven (§3.3).
 *
 * DREI ZUSAGEN, DIE STILL BRECHEN KOENNEN, und jede waere im Diagramm eine
 * falsche Steigung, die niemand nachrechnet:
 *
 * 1. GEWICHTET WIRD MIT `count` DER FRAGE, nicht mit `responseCount` des Abends.
 * 2. `stars` bleibt draussen — vier von fuenf Sternen waeren auf der umgekehrten
 *    Sechser-Achse „ausreichend" (§4.12).
 * 3. GESCHLUESSELT WIRD UEBER DIE `id`, nie ueber den Index: der Bogen ist je
 *    Umfrage gespeichertes JSON, und ein Alt-Import kann die Reihenfolge tauschen.
 */
describe("computeGroupTrend — die Frage-Ø je Monat (§3.3)", () => {
  const utc = (y: number, m: number, d: number) => Math.floor(Date.UTC(y, m - 1, d) / 1000);
  const st = (
    note: number | null,
    count: number,
    perQuestion: ReturnType<typeof computeDAStats>["perQuestion"],
  ): ReturnType<typeof computeDAStats> => ({
    perQuestion,
    overallAvg: note,
    avgSchulnote: note,
    hasLegacyScale: perQuestion.some((q) => q.type === "stars"),
    texts: [],
    responseCount: count,
  });
  const frage = (
    id: string,
    avg: number | null,
    anzahl: number,
    typ: "schulnote" | "stars" = "schulnote",
  ) => ({ id, text: `Frage ${id}`, type: typ as never, avg, count: anzahl });

  it("gibt je Monat einen Eintrag fuer JEDE Frage des Zeitraums — fehlende als null", () => {
    const trend = computeGroupTrend(
      [
        { date: utc(2026, 1, 5), stats: st(2, 4, [frage("q1", 2, 4)]) },
        { date: utc(2026, 3, 5), stats: st(3, 4, [frage("q2", 3, 4)]) },
      ],
      utc(2026, 1, 1),
      utc(2026, 3, 31),
    );
    expect(trend.map((p) => p.perQuestion.map((q) => q.id))).toEqual([
      ["q1", "q2"],
      ["q1", "q2"],
      ["q1", "q2"],
    ]);
    expect(trend[0].perQuestion[0].avg).toBeCloseTo(2);
    expect(trend[0].perQuestion[1].avg).toBeNull(); // q1-Monat kennt q2 nicht
    expect(trend[1].perQuestion.every((q) => q.avg === null)).toBe(true); // leerer Februar
    expect(trend[2].perQuestion[1].avg).toBeCloseTo(3);
  });

  it("gewichtet mit `count` DER FRAGE, nicht mit `responseCount` des Abends", () => {
    // Abend A: 14 Rueckmeldungen, aber nur 3 haben q1 beantwortet (Ø 1,0).
    // Abend B: 4 Rueckmeldungen, alle 4 haben q1 beantwortet (Ø 5,0).
    const trend = computeGroupTrend(
      [
        { date: utc(2026, 4, 5), stats: st(1, 14, [frage("q1", 1, 3)]) },
        { date: utc(2026, 4, 20), stats: st(5, 4, [frage("q1", 5, 4)]) },
      ],
      utc(2026, 4, 1),
      utc(2026, 4, 30),
    );
    // Richtig: (1*3 + 5*4) / 7 = 3,2857…
    expect(trend[0].perQuestion[0].avg).toBeCloseTo(23 / 7, 5);
    // Mit dem Abend-Nenner waeren es (1*14 + 5*4) / 18 = 1,888… — ein Monat, in
    // dem die Frage sichtbar schlecht lief, saehe fast „sehr gut" aus.
    expect(trend[0].perQuestion[0].avg).not.toBeCloseTo(34 / 18, 3);
  });

  it("laesst `stars`-Fragen ganz aus den Kurven heraus (§4.12)", () => {
    const trend = computeGroupTrend(
      [{ date: utc(2026, 4, 5), stats: st(2, 4, [frage("q1", 2, 4), frage("s1", 4, 4, "stars")]) }],
      utc(2026, 4, 1),
      utc(2026, 4, 30),
    );
    expect(trend[0].perQuestion.map((q) => q.id)).toEqual(["q1"]);
    expect(trend[0].hasLegacyScale).toBe(true); // die Fussnote bleibt
  });

  it("ordnet ueber die `id` zu, auch wenn der Bogen die Reihenfolge tauscht", () => {
    const trend = computeGroupTrend(
      [
        { date: utc(2026, 1, 5), stats: st(2, 4, [frage("q1", 1, 4), frage("q2", 5, 4)]) },
        // Zweiter Monat: dieselben Fragen, VERTAUSCHT — ein Index-Vergleich
        // haette hier q1 mit q2 gemittelt.
        { date: utc(2026, 2, 5), stats: st(2, 4, [frage("q2", 5, 4), frage("q1", 1, 4)]) },
      ],
      utc(2026, 1, 1),
      utc(2026, 2, 28),
    );
    for (const punkt of trend) {
      const q1 = punkt.perQuestion.find((q) => q.id === "q1")!;
      const q2 = punkt.perQuestion.find((q) => q.id === "q2")!;
      expect(q1.avg).toBeCloseTo(1);
      expect(q2.avg).toBeCloseTo(5);
    }
  });

  it("traegt den Fragetext mit — die Kurve wird direkt beschriftet, nicht mit einer id", () => {
    const trend = computeGroupTrend(
      [{ date: utc(2026, 4, 5), stats: st(2, 4, [frage("q1", 2, 4)]) }],
      utc(2026, 4, 1),
      utc(2026, 4, 30),
    );
    expect(trend[0].perQuestion[0].text).toBe("Frage q1");
  });

  it("zaehlt eine unbeantwortete Frage nicht als Null mit", () => {
    const trend = computeGroupTrend(
      [
        { date: utc(2026, 4, 5), stats: st(2, 4, [frage("q1", null, 0)]) },
        { date: utc(2026, 4, 20), stats: st(2, 4, [frage("q1", 2, 4)]) },
      ],
      utc(2026, 4, 1),
      utc(2026, 4, 30),
    );
    expect(trend[0].perQuestion[0].avg).toBeCloseTo(2);
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

/**
 * DIE VERTEILUNG JE FRAGE (§3.2 Punkt 2, §2.3).
 *
 * Der Grund dieser Funktion steht in ihrem ersten Test: 6×Note 1 und 6×Note 5
 * ergeben den Mittelwert 3,0. Ein Balken zeigte dort „befriedigend" — also genau
 * das, was NIEMAND geantwortet hat. Die Verteilung zeigt zwei Säulen und damit
 * die eine Aussage, die für den Abend zählt: die Gruppe ist gespalten.
 *
 * `Index 0 = Note 1`, damit der Wert ohne Umrechnung in
 * `NotenspurProps.verteilung` passt (`_ui/Noten.tsx:169`). Eine Umrechnung am
 * Aufrufer wäre eine zweite Stelle, an der sich die Richtung der Skala umdrehen
 * kann — und eine gespiegelte Notenspur behauptet das Gegenteil.
 */
describe("verteilungJeFrage (§3.2 Punkt 2)", () => {
  const EINE: Question[] = [{ id: "q1", type: "schulnote", text: "Insgesamt?" }];

  it("zeigt aus 6×1 und 6×5 ZWEI Säulen, nicht eine bei 3,0", () => {
    const antworten = [
      ...Array.from({ length: 6 }, () => ({ q1: 1 })),
      ...Array.from({ length: 6 }, () => ({ q1: 5 })),
    ];
    // Der Mittelwert, den ein Balken zeigen würde — belegt, nicht behauptet.
    expect(computeDAStats(EINE, antworten).avgSchulnote).toBeCloseTo(3);

    const [frage] = verteilungJeFrage(EINE, antworten);
    expect(frage.verteilung).toEqual([6, 0, 0, 0, 6, 0]);
    expect(frage.verteilung[2]).toBe(0); // die Mitte ist LEER
    expect(frage.count).toBe(12);
  });

  it("legt Note 1 auf Index 0 und Note 6 auf Index 5", () => {
    expect(verteilungJeFrage(EINE, [{ q1: 1 }])[0].verteilung).toEqual([1, 0, 0, 0, 0, 0]);
    expect(verteilungJeFrage(EINE, [{ q1: 6 }])[0].verteilung).toEqual([0, 0, 0, 0, 0, 1]);
  });

  it("gibt bei leerer Antwortmenge sechs Nullen — keine `null`-Sonderform", () => {
    const [frage] = verteilungJeFrage(EINE, []);
    expect(frage.verteilung).toEqual([0, 0, 0, 0, 0, 0]);
    expect(frage.count).toBe(0);
    expect(frage.id).toBe("q1");
    expect(frage.text).toBe("Insgesamt?");
  });

  it("zählt eine unbeantwortete Frage nicht mit", () => {
    const zwei: Question[] = [
      { id: "q1", type: "schulnote", text: "Insgesamt?" },
      { id: "q2", type: "schulnote", text: "Thema?" },
    ];
    // Drei Bögen, q2 nur einmal beantwortet (fehlend, leer, `null`).
    const out = verteilungJeFrage(zwei, [{ q1: 2, q2: 4 }, { q1: 2 }, { q1: 2, q2: null }]);
    expect(out.find((f) => f.id === "q1")!.count).toBe(3);
    const q2 = out.find((f) => f.id === "q2")!;
    expect(q2.count).toBe(1);
    expect(q2.verteilung).toEqual([0, 0, 0, 1, 0, 0]);
  });

  it("legt Werte außerhalb 1–6 in KEINE Zelle", () => {
    const [frage] = verteilungJeFrage(EINE, [
      { q1: 0 },
      { q1: 7 },
      { q1: 99 },
      { q1: -3 },
      { q1: 2.5 },
      { q1: "keine Zahl" },
      { q1: 3 },
    ]);
    expect(frage.verteilung).toEqual([0, 0, 1, 0, 0, 0]);
    expect(frage.count).toBe(1);
  });

  it("liest die tolerante Zahlform der Alt-App (`\"4\"` wie `4`)", () => {
    const [frage] = verteilungJeFrage(EINE, [{ q1: "4" }, { q1: 4 }]);
    expect(frage.verteilung).toEqual([0, 0, 0, 2, 0, 0]);
  });

  it("tastet `stars` NICHT auf die Sechser-Rampe ab (§4.12) — die Frage fehlt", () => {
    const gemischt: Question[] = [
      { id: "q1", type: "schulnote", text: "Insgesamt?" },
      { id: "s1", type: "stars", text: "Alt-Frage" },
      { id: "q9", type: "text", text: "Bestes?" },
    ];
    const out = verteilungJeFrage(gemischt, [{ q1: 1, s1: 4, q9: "gut" }]);
    expect(out.map((f) => f.id)).toEqual(["q1"]);
  });

  it("behält die Reihenfolge des Bogens", () => {
    const acht: Question[] = Array.from({ length: 8 }, (_, i) => ({
      id: `q${i + 1}`,
      type: "schulnote" as const,
      text: `Frage ${i + 1}`,
    }));
    expect(verteilungJeFrage(acht, []).map((f) => f.id)).toEqual([
      "q1",
      "q2",
      "q3",
      "q4",
      "q5",
      "q6",
      "q7",
      "q8",
    ]);
  });
});
