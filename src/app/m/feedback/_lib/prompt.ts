import { isRatingType } from "./questions";
import type { DAStats } from "./aggregation";

export interface PromptInput {
  groupName: string;
  eveningDate: string; // bereits formatiert "DD.MM.YYYY"
  topic?: string;
  participantCount?: number;
  stats: DAStats;
  rawAnswers: Record<string, unknown>[];
}

export function buildAnalysisPrompt(input: PromptInput): string {
  const { groupName, eveningDate, topic, participantCount, stats, rawAnswers } = input;
  const L: string[] = [];

  L.push(
    "Du bist ein erfahrener Ausbildungsberater beim Deutschen Roten Kreuz. " +
      "Analysiere die folgenden anonymisierten Rückmeldungen zu einem Dienstabend " +
      "einer Rotkreuz-Gruppe sachlich und konstruktiv.",
  );
  L.push("");
  L.push("Erstelle eine strukturierte Auswertung auf Deutsch mit folgenden Abschnitten:");
  L.push("1. **Stärken** - Was lief besonders gut? Beziehe dich auf konkrete Bewertungen und Aussagen.");
  L.push("2. **Verbesserungspotenzial** - Welche Bereiche schneiden schlechter ab oder werden kritisiert?");
  L.push("3. **Konkrete Empfehlungen** - Was sollte beim nächsten Dienstabend konkret anders gemacht werden?");
  L.push("4. **Fazit** - Ein kurzes zusammenfassendes Urteil.");
  L.push("");
  L.push(
    "Halte den Bericht sachlich, wertschätzend und handlungsorientiert. " +
      "Beziehe dich auf konkrete Aussagen aus den Freitextantworten.",
  );
  L.push("");
  L.push("---");
  L.push("");

  L.push("## Metadaten");
  L.push(`- Gruppe: ${groupName}`);
  L.push(`- Datum: ${eveningDate}`);
  if (topic && topic !== "") L.push(`- Thema: ${topic}`);
  L.push(`- Anzahl Rückmeldungen: ${stats.responseCount}`);
  if (participantCount !== undefined) L.push(`- Teilnehmer gesamt: ${participantCount}`);
  L.push("");

  L.push("## Durchschnittliche Bewertungen (Schulnoten: 1 = sehr gut, 6 = ungenügend)");
  for (const q of stats.perQuestion) {
    if (isRatingType(q.type) && q.avg !== null) L.push(`- ${q.text}: ${q.avg.toFixed(2)}`);
  }
  L.push(`- **Gesamtdurchschnitt: ${stats.overallAvg !== null ? stats.overallAvg.toFixed(2) : "–"}**`);
  L.push("");

  L.push("## Freitextantworten (gesammelt)");
  for (const t of stats.texts) {
    if (t.values.length === 0) continue;
    L.push("");
    L.push(`### ${t.text}`);
    for (const v of t.values) L.push(`- ${v}`);
  }
  L.push("");

  L.push("## Einzelne Rückmeldungen (Rohdaten)");
  L.push("");
  const ratings = stats.perQuestion.filter((q) => isRatingType(q.type));
  const textQs = stats.texts;
  rawAnswers.forEach((ans, i) => {
    L.push(`### Rückmeldung ${i + 1}`);
    for (const r of ratings) {
      const v = ans[r.id];
      const n = typeof v === "number" ? v : Number(v);
      if (Number.isFinite(n) && n > 0) L.push(`- ${r.text}: ${n.toFixed(0)}`);
    }
    for (const tq of textQs) {
      const v = ans[tq.questionId];
      if (typeof v === "string" && v.trim() !== "") L.push(`- ${tq.text}: ${v}`);
    }
    L.push("");
  });

  return L.join("\n");
}
