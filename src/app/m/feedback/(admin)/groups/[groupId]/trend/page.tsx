import { notFound } from "next/navigation";
import Link from "next/link";
import { Breadcrumb, Button } from "antd";
import { getGroup, listEvenings, getSurveyByEvening, listResponses } from "@/app/m/feedback/_db/queries";
import { guardPage } from "@/app/m/feedback/_lib/guardPage";
import { computeDAStats, computeGroupTrend, type DAStats } from "@/app/m/feedback/_lib/aggregation";
import type { Question } from "@/app/m/feedback/_lib/questions";
import { T } from "@/app/m/feedback/_ui/typo";
import { Altbestandsfussnote, Notenpille } from "@/app/m/feedback/_ui/Noten";
import { TrendDiagramm, type TrendFrage } from "@/app/m/feedback/_ui/TrendDiagramm";
import { MonatsSegment } from "@/app/m/feedback/_ui/Segment";
import { fensterAus } from "@/app/m/feedback/_lib/trendfenster";

/**
 * DER TREND EINER GRUPPE (Entwurf §3.3, Kopfzone §4.2, Breadcrumb §4.1).
 *
 * DREI ENTSCHEIDUNGEN:
 *
 * 1. DAS DIAGRAMM IST MODUL-LOKAL (`_ui/NotenVerlauf.tsx`, §5.3) und NICHT
 *    `core/charts/LineChart`: der färbt mit `token.colorPrimary` (Suite-Rot) und
 *    kennt keine umgekehrte Achse. Eine 6 höher als eine 1 ist ein SACHFEHLER,
 *    kein Geschmacksfehler.
 * 2. DAS ZEITFENSTER STEHT IN DER URL (`?monate=`, §3.3). Es entscheidet, welche
 *    Abende in die Kurve kommen — eine Datenfrage, die der Server beantwortet.
 *    Fremde oder fehlende Werte fallen auf 12 zurück; geklemmt wird HIER, damit
 *    `?monate=9999` keine 833 Monatsbuckets aufzählt.
 * 3. DER Ø IST `avgSchulnote` (§4.12), nie der gemischte `overallAvg`.
 * 4. DIE FRAGEKURVEN SIND ZUSCHALTBAR (§3.3): „Nur die Gesamtdurchschnittslinie
 *    ist Vorgabe; einzelne Fragen sind zuschaltbar, maximal drei gleichzeitig,
 *    gestrichelt und direkt beschriftet." Der Umschalter braucht Zustand, also
 *    liegen Schalterreihe und Diagramm zusammen in der Client-Insel
 *    `_ui/TrendDiagramm.tsx`. Die Monats-Ø je Frage kommen aus
 *    `computeGroupTrend` (`perQuestion`) — dieselbe Aggregationsstelle wie die
 *    Gesamtlinie, damit nicht zwei Rechnungen zwei Kurven fuer dieselbe Frage
 *    ergeben.
 *
 * SERVER COMPONENT: `Breadcrumb` über `items`, `Segmented` in der Client-Insel
 * `_ui/Segment.tsx` (§4.13).
 */
export default async function TrendPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string }>;
  searchParams?: Promise<{ monate?: string }>;
}) {
  const { groupId } = await params;
  const id = Number(groupId);

  // `id` ist hier zugleich Prüf- und Ladeschlüssel — die Gruppe SELBST ist die
  // geschützte Ressource, keine Ableitung über ein untergeordnetes evening/survey.
  const { db } = await guardPage(id);
  const group = getGroup(db, id);
  if (!group) notFound();

  const monate = fensterAus((await searchParams)?.monate);

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
  const from = Math.floor(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (monate - 1), 1) / 1000,
  );
  const trend = computeGroupTrend(evenings, from, to);

  return (
    <div style={{ maxWidth: 1120, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>
      <header style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <Breadcrumb
          style={T.meta}
          items={[
            { title: <Link href="/m/feedback">Gruppen</Link> },
            { title: <Link href={`/m/feedback/groups/${group.id}`}>{group.name}</Link> },
            { title: "Trend" },
          ]}
        />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <h1 style={{ ...T.h1, margin: 0, textWrap: "balance" }}>Trend — {group.name}</h1>
          <span className="fb-knopfzeile">
            <MonatsSegment monate={monate} />
            <Button
              type="text"
              href={`/m/feedback/groups/${group.id}/export.csv`}
              className="fb-block-mobil"
            >
              CSV
            </Button>
          </span>
        </div>
        {/* „Ø Note (1 = beste)" wortgenau wie der Spaltenkopf aus §4.11: ohne
            die Richtung liest sich eine 2,0 wie eine schwache Bewertung. */}
        <p style={{ ...T.meta, margin: 0 }}>
          Ø Note (1 = beste) je Monat, letzte {monate} Monate.
        </p>
      </header>

      <TrendDiagramm
        punkte={trend.map((t) => ({ label: t.label, note: t.avg }))}
        fragen={fragenAus(trend)}
      />

      <ul
        style={{
          margin: 0,
          paddingLeft: 24,
          display: "flex",
          flexDirection: "column",
          gap: 4,
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
            <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={T.body}>{t.label}:</span>
              <Notenpille note={t.avg} />
              <span style={T.meta}>
                ({t.responseCount} Rückmeldung{t.responseCount === 1 ? "" : "en"})
              </span>
              {t.hasLegacyScale && <Altbestandsfussnote />}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Die zuschaltbaren Fragen als eine Reihe je Frage (§3.3). `computeGroupTrend`
 * garantiert, dass JEDER Monat einen Eintrag fuer JEDE Frage des Zeitraums traegt
 * — deshalb genuegt der erste Punkt als Fragenliste, und die Werte liegen in
 * derselben Ordnung wie die Monate. Fehlt die Frage in einem Monat, ist der Wert
 * `null` und die Kurve reisst dort auf, statt eine Luecke gerade zu ziehen.
 */
function fragenAus(trend: ReturnType<typeof computeGroupTrend>): TrendFrage[] {
  return (trend[0]?.perQuestion ?? []).map((q, i) => ({
    id: q.id,
    text: q.text,
    werte: trend.map((t) => t.perQuestion[i]?.avg ?? null),
  }));
}
