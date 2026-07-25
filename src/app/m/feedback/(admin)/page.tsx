import { redirect } from "next/navigation";
import { Button, Result } from "antd";
import { auth } from "@/core/auth";
import { getDb } from "../_db/client";
import { listGroups, memberGroupIdsFor } from "../_db/queries";
import { viewerFromSession } from "../_lib/viewer";
import { accessibleGroupFilter, isFeedbackAdmin } from "../_lib/access";
import { cockpitZustand } from "../_lib/cockpit";
import { computeDAStats } from "../_lib/aggregation";
import type { Question } from "../_lib/questions";
import { listResponses } from "../_db/queries";
import { T } from "../_ui/typo";
import { formatTagMonat, formatZeitpunkt } from "../_ui/datum";
import { Gruppenkarten, type Gruppenkarte } from "../_ui/Gruppenkarten";

/**
 * DER EINSTIEG (Entwurf §3.1, Kopfzone §4.2, Leerzustand §4.3).
 *
 * DREI ENTSCHEIDUNGEN, DIE HIER UND NUR HIER LIEGEN:
 *
 * 1. GENAU EINE ZUGÄNGLICHE GRUPPE UND KEIN VOLL-ADMIN → `redirect` ins Cockpit.
 *    Wer eine Gruppe hat, hat auf dieser Seite nichts zu entscheiden, und eine
 *    Liste mit einem Eintrag ist ein Klick, der nichts bewirkt. Die
 *    Admin-AUSNAHME ist nötig, sonst käme ein Admin mit einer Gruppe nie an
 *    „Gruppenvergleich" und „+ Neue Gruppe".
 * 2. DER ZUSTAND WIRD HIER GERECHNET, nicht in der Karte: `cockpitZustand` ist
 *    DER Selektor des Moduls (§2.2), und die Karten sind eine Client-Insel, die
 *    keine Datenbank sieht. Über die RSC-Grenze gehen fertige Werte.
 * 3. DIE ORDNUNG IST FACHLICH: laufende Gruppen zuerst, dann nach letztem Abend
 *    absteigend (§3.1). Wer eine laufende Umfrage hat, sucht sie — und nicht die
 *    alphabetisch erste Gruppe.
 *
 * SERVER COMPONENT: kein Compound-Zugriff auf antd (§4.13) — Überschriften nativ
 * mit `T.*`, `Input.Search` und `Modal` liegen in `_ui/Gruppenkarten.tsx`. Keine
 * Breadcrumb: diese Seite IST die Wurzel, ein Krümel auf sich selbst wäre eine
 * Schleife (§4.1).
 */
export default async function FeedbackEinstieg() {
  const viewer = viewerFromSession(await auth());
  const db = getDb();
  const memberIds = viewer ? memberGroupIdsFor(db, viewer.sub, viewer.fachgruppen) : [];
  const filter = accessibleGroupFilter(viewer, memberIds);
  const alle = listGroups(db);
  const gruppen = filter === "all" ? alle : alle.filter((g) => filter.includes(g.id));
  const istAdmin = isFeedbackAdmin(viewer);

  // Der Sprung ins Cockpit passiert VOR jeder Aggregation: er ist der häufigste
  // Fall des Moduls, und die Zahlen der Karte braucht dafür niemand.
  if (gruppen.length === 1 && !istAdmin) redirect(`/m/feedback/groups/${gruppen[0].id}`);

  const jetzt = new Date();
  const karten = gruppen
    .map((gruppe) => {
      const zustand = cockpitZustand(db, gruppe.id, jetzt);
      const juengster = zustand.laufend ?? zustand.verlauf[0] ?? null;
      /**
       * Die Note kommt vom letzten AUSGEWERTETEN Abend (§2.7: geschlossen und
       * mindestens eine Rückmeldung) — nie von der laufenden Umfrage. Eine
       * vorläufige Zahl auf der Einstiegskarte wäre ein Urteil über einen Abend,
       * der noch läuft, und diese Seite trägt keinen „Zwischenstand"-Vorbehalt.
       */
      const note = zustand.letzterAbend?.survey
        ? abendNote(db, zustand.letzterAbend.survey.questions, zustand.letzterAbend.survey.id)
        : null;
      const laufend = zustand.laufend;
      const teilnehmer = laufend?.evening.participantCount ?? null;
      const nenner = teilnehmer !== null && teilnehmer > 0 ? teilnehmer : null;

      const karte: Gruppenkarte = {
        id: gruppe.id,
        name: gruppe.name,
        laufend: laufend
          ? {
              // Kein erfundener Nenner (§2.3): ohne Teilnehmerzahl steht dort die
              // reine Zahl der Rückmeldungen.
              zaehler:
                nenner === null
                  ? `${laufend.responseCount} ${laufend.responseCount === 1 ? "Rückmeldung" : "Rückmeldungen"}`
                  : `${laufend.responseCount} von ${nenner}`,
              // Die Frist steht so, wie sie GERECHNET wurde (`computeClosesAt` auf
              // dem Abenddatum) — nie „48 Stunden ab jetzt".
              frist: laufend.survey.closesAt ? formatZeitpunkt(laufend.survey.closesAt) : null,
            }
          : null,
        letzterAbend: zustand.verlauf[0] ? formatTagMonat(zustand.verlauf[0].evening.date) : null,
        note,
      };
      return { karte, laufend: laufend !== null, sortiert: juengster?.evening.date.getTime() ?? 0 };
    })
    // Laufende zuerst, dann nach letztem Abend absteigend (§3.1).
    .sort((a, b) => Number(b.laufend) - Number(a.laufend) || b.sortiert - a.sortiert)
    .map((x) => x.karte);

  return (
    <div style={{ maxWidth: 1120, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>
      <header style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <h1 style={{ ...T.h1, margin: 0, textWrap: "balance" }}>Deine Gruppen</h1>
          {/* Der Vergleich hat keine `group_id`, gegen die ein Guard prüfen könnte
              — er zeigt Daten ALLER Gruppen. Deshalb steht der Weg dorthin nur
              Admins offen, und die Seite selbst prüft es ein zweites Mal (§3.4). */}
          {istAdmin && (
            <Button type="text" href="/m/feedback/vergleich">
              Gruppenvergleich
            </Button>
          )}
        </div>
        <p style={{ ...T.meta, margin: 0 }}>Je Gruppe ein dauerhafter QR-Code.</p>
      </header>

      {karten.length === 0 && !istAdmin ? (
        <Result status="info" title="Dir ist noch keine Gruppe zugeordnet." />
      ) : (
        <Gruppenkarten gruppen={karten} istAdmin={istAdmin} />
      )}
    </div>
  );
}

/**
 * Die Note eines Abends — über `computeDAStats`, die EINE Aggregationsstelle, und
 * damit `avgSchulnote` und nie `overallAvg` (§4.12).
 */
function abendNote(
  db: ReturnType<typeof getDb>,
  fragenJson: string,
  surveyId: number,
): number | null {
  const questions: Question[] = JSON.parse(fragenJson);
  const antworten = listResponses(db, surveyId).map(
    (r) => JSON.parse(r.answers) as Record<string, unknown>,
  );
  return computeDAStats(questions, antworten).avgSchulnote;
}
