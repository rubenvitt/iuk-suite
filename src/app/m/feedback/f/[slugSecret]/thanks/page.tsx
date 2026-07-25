import { getDb } from "../../../_db/client";
import { getGroupBySlug, activeSurveyForGroup } from "../../../_db/queries";
import { parseToken } from "../../../_lib/token";
import { Huelle, Weitergabe, ZustandF } from "../Zustaende";
import s from "../zettel.module.css";

/**
 * ZUSTAND B — DIE DANKE-SEITE (Entwurf 3.2 B).
 *
 * Zwei Entscheidungen stecken hier drin:
 *
 * 1. KEINE Antworten auf dem Schirm. Das Handy wandert weiter — was hier stehen
 *    bliebe, laese die naechste Person. Deshalb wird hier nichts aus `responses`
 *    geholt, nicht einmal zum Bestaetigen.
 * 2. Der Weitergabe-Abschnitt steht unbedingt da, nicht nur bei vorhandenem
 *    Cookie: auf einem geteilten Geraet ist die naechste Person der Regelfall.
 */
export default async function ThanksPage({
  params,
}: {
  params: Promise<{ slugSecret: string }>;
}) {
  const { slugSecret } = await params;
  const parsed = parseToken(slugSecret);
  if (!parsed) return <ZustandF />;
  const db = getDb();
  const group = getGroupBySlug(db, parsed.slug);
  if (!group || group.secret !== parsed.secret) return <ZustandF />;
  /*
   * Der Knopf braucht die Umfrage-Id, denn das Cookie heisst `feedback-${id}`.
   * Ist die Umfrage inzwischen geschlossen, gibt es nichts freizugeben — dann
   * bleibt die Seite beim Dank, statt einen Knopf anzubieten, der ins Leere
   * fuehrt.
   */
  const active = activeSurveyForGroup(db, group.id);

  return (
    <Huelle titel="Danke." gross>
      <div className={s.zustand}>
        <p className={s.text}>Deine Rückmeldung ist eingegangen — anonym.</p>
        {active ? <Weitergabe slugSecret={slugSecret} surveyId={active.survey.id} /> : null}
      </div>
    </Huelle>
  );
}
