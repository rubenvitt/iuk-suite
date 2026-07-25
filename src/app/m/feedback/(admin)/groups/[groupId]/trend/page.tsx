import { notFound } from "next/navigation";
import { getGroup, listEvenings, getSurveyByEvening, listResponses } from "@/app/m/feedback/_db/queries";
import { guardPage } from "@/app/m/feedback/_lib/guardPage";
import { computeDAStats, computeGroupTrend, type DAStats } from "@/app/m/feedback/_lib/aggregation";
import type { Question } from "@/app/m/feedback/_lib/questions";
import { SPACE } from "@/core/theme/tokens";
import { LineChart } from "@/core/charts/LineChart";
import { Altbestandsfussnote, Notenpille } from "@/app/m/feedback/_ui/Noten";

// Server-Komponente: kein antd-Compound-Zugriff — LineChart ist eine eigene
// Client-Komponente, die diese Server-Komponente direkt rendern darf.
export default async function TrendPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const id = Number(groupId);

  // `id` ist hier zugleich Prüf- und Ladeschlüssel — die Gruppe SELBST ist die
  // geschützte Ressource (wie bei GroupDetail aus Task 12), keine Ableitung
  // über ein untergeordnetes evening/survey nötig.
  const { db } = await guardPage(id);
  const group = getGroup(db, id);
  if (!group) notFound();

  const evenings: { date: number; stats: DAStats }[] = [];
  for (const evening of listEvenings(db, id)) {
    const survey = getSurveyByEvening(db, evening.id);
    if (!survey) continue;
    const questions: Question[] = JSON.parse(survey.questions);
    const answers = listResponses(db, survey.id).map(
      (r) => JSON.parse(r.answers) as Record<string, unknown>,
    );
    evenings.push({
      date: Math.floor(new Date(evening.date).getTime() / 1000),
      stats: computeDAStats(questions, answers),
    });
  }

  const now = new Date();
  const to = Math.floor(now.getTime() / 1000);
  const from = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1) / 1000);
  const trend = computeGroupTrend(evenings, from, to);

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: SPACE.xxl, padding: SPACE.lg }}>
      <section style={{ display: "flex", flexDirection: "column", gap: SPACE.sm }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Trend — {group.name}</h1>
        {/* „Ø Note (1 = beste)" wortgenau wie der Spaltenkopf aus §4.11: ohne
            die Richtung liest sich eine 2,0 wie eine schwache Bewertung. */}
        <p style={{ margin: 0 }}>Ø Note (1 = beste) je Monat, letzte 12 Monate.</p>
      </section>

      <LineChart data={trend.map((t) => ({ x: t.label, y: t.avg }))} xKey="x" yKey="y" domain={[1, 6]} />

      <ul
        style={{
          margin: 0,
          paddingLeft: SPACE.lg,
          display: "flex",
          flexDirection: "column",
          gap: SPACE.xs,
        }}
      >
        {/*
         * `t.avg` ist der SCHULNOTEN-Ø (§4.12) — die Notenpille trägt ihn mit
         * Ziffer, Wort und Farbe, damit die Zeile nicht allein an der Zahl
         * hängt. Monate mit Altbestands-Fragen bekommen die Fußnote: ihr Ø ist
         * aus weniger Fragen gebildet als der Bogen hat, und ohne den Satz
         * bliebe unerklärt, warum ein Monat mit Rückmeldungen „—" zeigt.
         */}
        {trend.map((t) => (
          <li key={t.label}>
            <span style={{ display: "flex", alignItems: "center", gap: SPACE.sm, flexWrap: "wrap" }}>
              <span>{t.label}:</span>
              <Notenpille note={t.avg} />
              <span>
                ({t.responseCount} Rückmeldung{t.responseCount === 1 ? "" : "en"})
              </span>
              {t.hasLegacyScale && <Altbestandsfussnote />}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
