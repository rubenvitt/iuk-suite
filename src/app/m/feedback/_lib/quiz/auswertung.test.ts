import { describe, it, expect } from "vitest";
import type { QuizAntwortRow, QuizRundeRow, QuizTeilnahmeRow } from "@/app/m/feedback/_db/schema";
import { auswertung } from "./auswertung";
import type { QuizFrage } from "./fragen";

const fragen: QuizFrage[] = [
  { text: "F1", typ: "einfach", optionen: ["A", "B", "C"], richtig: [1], erklaerung: "weil" },
  { text: "F2", typ: "mehrfach", optionen: ["X", "Y"], richtig: [0, 1] },
];
const runde = (modus: "lagebild" | "wettbewerb", beendet: boolean): QuizRundeRow => ({
  id: 1, quizId: 1, eveningId: 1, beitrittCode: "ABCDEF", modus, fragen: JSON.stringify(fragen),
  schritt: 3, schrittSeit: 0, hoechsterSchritt: 3, hoechsterSeit: 0,
  beendetAt: beendet ? 5 : null, createdAt: new Date(0),
});
const tn = (id: number, name: string | null): QuizTeilnahmeRow => ({ id, rundeId: 1, spitzname: name, tokenHash: null });
const an = (t: number, f: number, w: number[], richtig: boolean, punkte: number): QuizAntwortRow => ({
  teilnahmeId: t, frageIndex: f, antwort: JSON.stringify(w), richtig: richtig ? 1 : 0, punkte, antwortzeitMs: null,
});
const antworten = [
  an(1, 0, [1], true, 900), an(2, 0, [0], false, 0), an(3, 0, [1], true, 900),
  an(1, 1, [0, 1], true, 1000),
];

describe("auswertung", () => {
  it("rechnet je Frage Verteilung und Anteil richtig, dazu den Gesamtanteil", () => {
    const s = auswertung({ runde: runde("wettbewerb", true), teilnahmen: [tn(1, "Anna"), tn(2, "Bert"), tn(3, "Cora")], antworten }, "Funk");
    expect(s.fragen[0]).toMatchObject({ antworten: 3, verteilung: [1, 2, 0], richtig: [1], erklaerung: "weil" });
    expect(s.fragen[0].anteilRichtig).toBeCloseTo(2 / 3);
    expect(s.fragen[1]).toMatchObject({ antworten: 1, verteilung: [1, 1], anteilRichtig: 1 });
    expect(s.anteilRichtig).toBeCloseTo(3 / 4);
    expect(s.teilnehmende).toBe(3);
    expect(s.beendet).toBe(true);
  });

  it("ohne Antworten gibt es keinen Anteil (kein erfundener Wert)", () => {
    const s = auswertung({ runde: runde("lagebild", false), teilnahmen: [], antworten: [] }, "Funk");
    expect(s.anteilRichtig).toBeNull();
    expect(s.fragen.every((f) => f.anteilRichtig === null)).toBe(true);
    expect(s.beendet).toBe(false);
  });

  it("Wettbewerb: volle Rangliste, Gleichstand teilt den Platz", () => {
    const s = auswertung({ runde: runde("wettbewerb", true), teilnahmen: [tn(1, "Anna"), tn(2, "Bert"), tn(3, "Cora"), tn(4, "Dora")], antworten }, "Funk");
    expect(s.rangliste).toEqual([
      { platz: 1, spitzname: "Anna", punkte: 1900 },
      { platz: 2, spitzname: "Cora", punkte: 900 },
      { platz: 3, spitzname: "Bert", punkte: 0 },
      { platz: 3, spitzname: "Dora", punkte: 0 },
    ]);
  });

  it("Lagebild: keine Rangliste, kein Spitzname irgendwo", () => {
    const s = auswertung({ runde: runde("lagebild", true), teilnahmen: [tn(1, null), tn(2, null), tn(3, null)], antworten }, "Funk");
    expect(s.rangliste).toBeUndefined();
    expect(JSON.stringify(s)).not.toMatch(/spitzname|Anna/);
  });
});
