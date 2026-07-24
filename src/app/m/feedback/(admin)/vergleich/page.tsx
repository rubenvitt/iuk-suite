import { notFound } from "next/navigation";
import { auth } from "@/core/auth";
import { getDb } from "@/app/m/feedback/_db/client";
import { listGroups, listEvenings, getSurveyByEvening, listResponses } from "@/app/m/feedback/_db/queries";
import { viewerFromSession } from "@/app/m/feedback/_lib/viewer";
import { isFeedbackAdmin } from "@/app/m/feedback/_lib/access";
import { computeDAStats, type GroupComparison } from "@/app/m/feedback/_lib/aggregation";
import type { Question } from "@/app/m/feedback/_lib/questions";
import { SPACE } from "@/core/theme/tokens";
import { BarChart } from "@/core/charts/BarChart";

// Nur für Voll-Admins (isFeedbackAdmin): "Vergleich" hat keine group_id, gegen
// die assertGroupAccess/guardPage prüfen könnten — die Seite zeigt Daten
// ALLER Gruppen, also entscheidet allein die Admin-Rolle. 404 statt 403 —
// verrät die Existenz der Seite nicht (wie bei den group-gescopten Seiten).
export default async function VergleichPage() {
  const viewer = viewerFromSession(await auth());
  if (!isFeedbackAdmin(viewer)) notFound();

  const db = getDb();

  const comparisons: GroupComparison[] = listGroups(db).map((group) => {
    // Gewichtetes Gesamt-Ø über ALLE Dienstabende der Gruppe — dieselbe
    // Gewichtung (nach responseCount) wie computeGroupTrend, nur über einen
    // einzigen Bucket "alle Zeit" statt Monatsbuckets.
    let weighted = 0;
    let weight = 0;
    let responseCount = 0;
    for (const evening of listEvenings(db, group.id)) {
      const survey = getSurveyByEvening(db, evening.id);
      if (!survey) continue;
      const questions: Question[] = JSON.parse(survey.questions);
      const answers = listResponses(db, survey.id).map(
        (r) => JSON.parse(r.answers) as Record<string, unknown>,
      );
      const stats = computeDAStats(questions, answers);
      responseCount += stats.responseCount;
      if (stats.overallAvg !== null) {
        weighted += stats.overallAvg * stats.responseCount;
        weight += stats.responseCount;
      }
    }
    return {
      groupId: group.id,
      groupName: group.name,
      overallAvg: weight > 0 ? weighted / weight : null,
      responseCount,
    };
  });

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: SPACE.xxl, padding: SPACE.lg }}>
      <section style={{ display: "flex", flexDirection: "column", gap: SPACE.sm }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Gruppen-Vergleich</h1>
        <p style={{ margin: 0 }}>Gesamtdurchschnitt je Gruppe, über alle Dienstabende.</p>
      </section>

      <BarChart
        data={comparisons.map((c) => ({ x: c.groupName, y: c.overallAvg }))}
        xKey="x"
        yKey="y"
        domain={[1, 6]}
      />

      <ul
        style={{
          margin: 0,
          paddingLeft: SPACE.lg,
          display: "flex",
          flexDirection: "column",
          gap: SPACE.xs,
        }}
      >
        {comparisons.map((c) => (
          <li key={c.groupId}>
            {c.groupName}: {c.overallAvg !== null ? c.overallAvg.toFixed(2) : "–"} ({c.responseCount}{" "}
            Rückmeldung{c.responseCount === 1 ? "" : "en"})
          </li>
        ))}
      </ul>
    </section>
  );
}
