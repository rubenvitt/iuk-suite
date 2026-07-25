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
   * Die Umfrage-Id, WENN es eine aktive gibt: das Cookie heisst `feedback-${id}`,
   * und nur mit ihr kann `releaseDeviceAction` es loeschen. Fehlt sie (die Frist
   * kann zwischen dem Absenden und dieser Seite ablaufen), bleibt der Abschnitt
   * trotzdem stehen und fuehrt per Link auf das Formular — genau dieser Weg loest
   * das Problem des geteilten Handys, und ohne aktive Umfrage gibt es dort auch
   * nichts freizugeben.
   */
  const active = activeSurveyForGroup(db, group.id);

  return (
    <Huelle titel="Danke." gross>
      <div className={s.zustand}>
        <p className={s.text}>Deine Rückmeldung ist eingegangen — anonym.</p>
        <Weitergabe slugSecret={slugSecret} surveyId={active?.survey.id} />
      </div>
    </Huelle>
  );
}
