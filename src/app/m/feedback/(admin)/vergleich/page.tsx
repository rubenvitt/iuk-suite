import { notFound } from "next/navigation";
import Link from "next/link";
import { Breadcrumb } from "antd";
import { auth } from "@/core/auth";
import { getDb } from "@/app/m/feedback/_db/client";
import { listGroups, listEvenings, getSurveyByEvening, listResponses } from "@/app/m/feedback/_db/queries";
import { viewerFromSession } from "@/app/m/feedback/_lib/viewer";
import { isFeedbackAdmin } from "@/app/m/feedback/_lib/access";
import { computeDAStats } from "@/app/m/feedback/_lib/aggregation";
import { NOTEN_FENSTER } from "@/app/m/feedback/_lib/noten";
import type { Question } from "@/app/m/feedback/_lib/questions";
import { T } from "@/app/m/feedback/_ui/typo";
import { VergleichTabelle, type VergleichZeile } from "@/app/m/feedback/_ui/VergleichTabelle";

/**
 * DER GRUPPENVERGLEICH (Entwurf §3.4, Kopfzone §4.2, Breadcrumb §4.1).
 *
 * Nur für Voll-Admins (`isFeedbackAdmin`): „Vergleich" hat keine `group_id`, gegen
 * die `assertGroupAccess`/`guardPage` prüfen könnten — die Seite zeigt Daten ALLER
 * Gruppen, also entscheidet allein die Admin-Rolle. 404 statt 403, damit die
 * Existenz der Seite nicht verraten wird (wie bei den group-gescopten Seiten).
 *
 * ZWEI ENTSCHEIDUNGEN:
 *
 * 1. GEWICHTET WIRD `avgSchulnote`, NICHT `overallAvg` (§4.12). Genau hier ist der
 *    gemischte Wert am teuersten: eine Gruppe mit importierten Alt-Bögen stünde in
 *    DERSELBEN Spalte wie eine mit neuen, ihre Sterne (1–5) auf die
 *    Schulnotenrampe (1–6) abgetastet.
 * 2. AUFSTEIGEND NACH Ø, BESTER ZUERST (§3.4) — hier und nicht in der Tabelle:
 *    die Ordnung ist eine Aussage der Seite, kein Bedienelement. Gruppen ohne Ø
 *    stehen am Ende; ein `null` vorn wäre die beste Note.
 */
export default async function VergleichPage() {
  const viewer = viewerFromSession(await auth());
  if (!isFeedbackAdmin(viewer)) notFound();

  const db = getDb();

  const zeilen: VergleichZeile[] = listGroups(db)
    .map((group) => {
      // Gewichtetes Gesamt-Ø über ALLE Dienstabende der Gruppe — dieselbe
      // Gewichtung (nach responseCount) wie computeGroupTrend, nur über einen
      // einzigen Bucket „alle Zeit" statt Monatsbuckets. Abende ohne beantwortete
      // Schulnotenfrage bekommen kein Gewicht, bleiben aber gezählt: die
      // Rückmeldungen gab es, nur eine Note gab es nicht.
      let weighted = 0;
      let weight = 0;
      let rueckmeldungen = 0;
      let hasLegacyScale = false;
      let abende = 0;
      const quoten: number[] = [];
      /** Abenddatum + Note, für den Funken chronologisch sortiert. */
      const noten: { datum: number; note: number }[] = [];

      for (const evening of listEvenings(db, group.id)) {
        const survey = getSurveyByEvening(db, evening.id);
        if (!survey) continue;
        abende += 1;
        const questions: Question[] = JSON.parse(survey.questions);
        const answers = listResponses(db, survey.id).map(
          (r) => JSON.parse(r.answers) as Record<string, unknown>,
        );
        const stats = computeDAStats(questions, answers);
        rueckmeldungen += stats.responseCount;
        hasLegacyScale = hasLegacyScale || stats.hasLegacyScale;
        // Nur Abende MIT Teilnehmerzahl gehen in den Rücklauf-Ø: ein erfundener
        // Nenner wäre hier eine Quote, die zwei Gruppen vergleicht (§2.3).
        if (evening.participantCount !== null && evening.participantCount > 0) {
          quoten.push(Math.min(100, (stats.responseCount / evening.participantCount) * 100));
        }
        if (stats.avgSchulnote !== null) {
          weighted += stats.avgSchulnote * stats.responseCount;
          weight += stats.responseCount;
          noten.push({ datum: evening.date.getTime(), note: stats.avgSchulnote });
        }
      }

      return {
        groupId: group.id,
        name: group.name,
        abende,
        ruecklauf:
          quoten.length === 0
            ? null
            : Math.round(quoten.reduce((s, q) => s + q, 0) / quoten.length),
        note: weight > 0 ? weighted / weight : null,
        // Dasselbe Fenster wie im Verlauf (`NOTEN_FENSTER`), ÄLTESTE ZUERST — ein
        // rückwärts gezeichneter Funke behauptet das Gegenteil.
        noten: noten
          .sort((a, b) => b.datum - a.datum)
          .slice(0, NOTEN_FENSTER)
          .reverse()
          .map((n) => n.note),
        rueckmeldungen,
        hasLegacyScale,
      };
    })
    .sort((a, b) => {
      if (a.note === null && b.note === null) return 0;
      if (a.note === null) return 1;
      if (b.note === null) return -1;
      return a.note - b.note;
    });

  return (
    <div style={{ maxWidth: 1120, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>
      <header style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <Breadcrumb
          style={T.meta}
          items={[
            { title: <Link href="/m/feedback">Gruppen</Link> },
            { title: "Gruppenvergleich" },
          ]}
        />
        <h1 style={{ ...T.h1, margin: 0, textWrap: "balance" }}>Gruppenvergleich</h1>
        <p style={{ ...T.meta, margin: 0 }}>
          Ø Note (1 = beste) je Gruppe, über alle Dienstabende — bester zuerst.
        </p>
      </header>

      <VergleichTabelle zeilen={zeilen} />
    </div>
  );
}
