import { describe, it, expect } from "vitest";
import { buildAnalysisPrompt } from "./prompt";
import type { DAStats } from "./aggregation";

const stats: DAStats = {
  perQuestion: [
    { id: "q1", text: "Insgesamt?", type: "schulnote", avg: 2.5, count: 4 },
    { id: "q9", text: "Bestes?", type: "text", avg: null, count: 1 },
  ],
  overallAvg: 2.5,
  texts: [{ questionId: "q9", text: "Bestes?", values: ["super Praxis"] }],
  responseCount: 4,
};

describe("buildAnalysisPrompt", () => {
  it("enthält Instruktion, Metadaten, Bewertungen, Freitexte", () => {
    const p = buildAnalysisPrompt({
      groupName: "München",
      eveningDate: "09.04.2026",
      topic: "Erste Hilfe",
      participantCount: 12,
      stats,
      rawAnswers: [{ q1: 2, q9: "super Praxis" }],
    });
    expect(p).toContain("Deutschen Roten Kreuz");
    expect(p).toContain("- Gruppe: München");
    expect(p).toContain("- Datum: 09.04.2026");
    expect(p).toContain("- Thema: Erste Hilfe");
    expect(p).toContain("- Anzahl Rückmeldungen: 4");
    expect(p).toContain("Insgesamt?: 2.50");
    expect(p).toContain("Gesamtdurchschnitt: 2.50");
    expect(p).toContain("super Praxis");
  });
  it("lässt optionale Felder weg wenn nicht gesetzt", () => {
    const p = buildAnalysisPrompt({
      groupName: "Nord",
      eveningDate: "01.01.2026",
      stats,
      rawAnswers: [],
    });
    expect(p).not.toContain("- Thema:");
    expect(p).not.toContain("- Teilnehmer gesamt:");
  });
});
