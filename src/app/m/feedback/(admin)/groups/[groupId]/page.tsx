import { notFound } from "next/navigation";
import Link from "next/link";
import { Breadcrumb, Card, Col, Row, Statistic } from "antd";
import { getDb } from "../../../_db/client";
import { getGroup, listResponses } from "../../../_db/queries";
import type { SurveyRow } from "../../../_db/schema";
import { guardPage } from "../../../_lib/guardPage";
import { cockpitZustand } from "../../../_lib/cockpit";
import { computeDAStats } from "../../../_lib/aggregation";
import { DEFAULT_CLOSE_AFTER_HOURS } from "../../../_lib/lifecycle";
import type { Question } from "../../../_lib/questions";
import { T } from "../../../_ui/typo";
import { formatDatumKurz, heuteInZone } from "../../../_ui/datum";
import { Notenpille } from "../../../_ui/Noten";
import { Lagekarte } from "../../../_ui/Lagekarte";

/**
 * DAS COCKPIT (Entwurf §2.1). Die einzige Arbeitsseite des Moduls.
 *
 * Server Component: kein Compound-Zugriff auf antd (§4.13 — `Typography.*`,
 * `Card.Meta`, `Breadcrumb.Item` … ergeben HTTP 500, den `pnpm build` nicht
 * sieht), `Breadcrumb` deshalb über `items`, Überschriften nativ mit `T.*`.
 *
 * Der Zustand wird EINMAL entschieden (`cockpitZustand`) und dann nur noch
 * dargestellt. Die Reihenfolge im DOM ist in jedem Zustand dieselbe: Kopfzone,
 * dann links „Letzter Abend" → Lagekarte, rechts die Teilnahme-Zone. In der
 * Betriebsart „Einrichtung" (kein Dienstabend) ist die Seite schmaler und
 * einspaltig, und der Verlauf entfällt vollständig — ein leeres Fach ist
 * schlimmer als kein Fach (§4.3).
 */
export default async function Cockpit({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const id = Number(groupId);
  // Guard zuerst, mit derselben `id`, die anschließend lädt: kein Auseinanderlaufen
  // zwischen geprüftem und geladenem Schlüssel.
  const { db } = await guardPage(id);
  const group = getGroup(db, id);
  if (!group) notFound();

  const jetzt = new Date();
  const zustand = cockpitZustand(db, id, jetzt);
  const stunden = group.closeAfterHours ?? DEFAULT_CLOSE_AFTER_HOURS;
  const einrichtung = zustand.modus === "einrichtung";
  /**
   * Freitextzählung für den Zwischenstand der Lagekarte (§2.3: „5 Freitexte — in
   * der Auswertung nachlesen"). Gerechnet HIER, mit `computeDAStats` — derselben
   * EINEN Aggregationsstelle, die auch „Letzter Abend" liest. Eine zweite
   * Zählschleife wäre eine zweite Wahrheit über denselben Datensatz.
   */
  const laufendeFreitexte = zustand.laufend
    ? zaehleFreitexte(abendStats(db, zustand.laufend.survey))
    : 0;

  return (
    <div
      style={{
        maxWidth: einrichtung ? 760 : 1120,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: 24,
      }}
    >
      <header style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <Breadcrumb
          style={T.meta}
          items={[
            { title: <Link href="/m/feedback">Feedback</Link> },
            { title: group.name },
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
          <h1 style={{ ...T.h1, margin: 0, textWrap: "balance" }}>{group.name}</h1>
        </div>
        <p style={{ ...T.meta, margin: 0 }}>
          {zustand.verlauf.length + (zustand.laufend ? 1 : 0) === 0
            ? "Noch kein Dienstabend erfasst."
            : `${zustand.verlauf.length + (zustand.laufend ? 1 : 0)} Dienstabende erfasst`}
        </p>
      </header>

      <Row gutter={[24, 24]}>
        <Col xs={24} lg={einrichtung ? 24 : 15}>
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {zustand.letzterAbend && (
              <LetzterAbend groupId={id} lage={zustand.letzterAbend} db={db} />
            )}
            <Lagekarte
              groupId={id}
              zustand={zustand}
              jetzt={jetzt}
              stunden={stunden}
              heute={heuteInZone(jetzt)}
              freitexte={laufendeFreitexte}
            />
          </div>
        </Col>
        {/*
         * Rechte Spalte: die Teilnahme-Zone (QR, Link, Aushang) zieht hier ein.
         * Sie hängt an der Gruppe, nicht an der Umfrage, und ist deshalb in jeder
         * Belegung identisch. Bis dahin bleibt die Spalte leer statt einen
         * Platzhalter zu zeigen (§4.3: kein leeres Fach mit Illustration).
         */}
        {!einrichtung && <Col xs={24} lg={9} style={{ alignSelf: "flex-start" }} />}
      </Row>
    </div>
  );
}

/**
 * Kennzahlen EINES Abends. Beide Leser der Seite („Letzter Abend" und der
 * Zwischenstand der Lagekarte) gehen durch diese Funktion, damit es genau einen
 * Weg von den Rohantworten zu Zahlen gibt.
 */
function abendStats(db: ReturnType<typeof getDb>, survey: SurveyRow) {
  const questions: Question[] = JSON.parse(survey.questions);
  const antworten = listResponses(db, survey.id).map(
    (r) => JSON.parse(r.answers) as Record<string, unknown>,
  );
  // `avgSchulnote`, NICHT `overallAvg`: eine 1–5-Altbestandsfrage darf nicht auf
  // die Sechser-Rampe abgetastet werden (§4.12).
  return computeDAStats(questions, antworten);
}

/** Freitext-ANTWORTEN, nicht Freitext-FRAGEN: die Karte nennt „5 Freitexte". */
const zaehleFreitexte = (stats: ReturnType<typeof abendStats>) =>
  stats.texts.reduce((summe, frage) => summe + frage.values.length, 0);

/**
 * SLOT „LETZTER ABEND" (§2.7). Beantwortet „habe ich das schon gelesen?" ohne
 * Klick — und zwar AUCH, während eine Umfrage läuft. Bewusst kein Primärknopf:
 * der Primärknopf der Seite ist immer die Zustandsaktion.
 */
function LetzterAbend({
  groupId,
  lage,
  db,
}: {
  groupId: number;
  lage: NonNullable<ReturnType<typeof cockpitZustand>["letzterAbend"]>;
  db: ReturnType<typeof getDb>;
}) {
  const stats = abendStats(db, lage.survey!);

  return (
    <Card
      variant="outlined"
      title="LETZTER ABEND"
      styles={{
        header: {
          ...T.kicker,
          minHeight: 40,
          paddingInline: 20,
          borderBottomColor: "var(--fb-split)",
        },
        body: { padding: 20 },
      }}
    >
      <p style={{ ...T.body, margin: "0 0 12px" }}>
        {formatDatumKurz(lage.evening.date)}
        {lage.evening.topic ? ` · ${lage.evening.topic}` : ""}
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <Statistic
          value={lage.responseCount}
          valueStyle={T.h2}
          suffix={<span style={{ ...T.body, color: "var(--fb-muted)" }}>Rückmeldungen</span>}
        />
        <Notenpille note={stats.avgSchulnote} />
        <Link
          href={`/m/feedback/groups/${groupId}/evenings/${lage.evening.id}/auswertung`}
          style={{ ...T.body, fontWeight: 600 }}
          className="fb-fokus"
        >
          Auswertung ansehen
        </Link>
      </div>
    </Card>
  );
}
