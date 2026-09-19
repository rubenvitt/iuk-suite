import { getDb } from "../../../_db/client";
import { getGroupBySlug } from "../../../_db/queries";
import { parseToken } from "../../../_lib/token";
import { DankeZeichen, Huelle, ZustandF } from "../Zustaende";
import s from "../zettel.module.css";

/**
 * ZUSTAND B — DIE DANKE-SEITE (Entwurf 3.2 B).
 *
 * Zwei Entscheidungen stecken hier drin:
 *
 * 1. KEINE Antworten auf dem Schirm. Das Handy wandert weiter — was hier stehen
 *    bliebe, laese die naechste Person. Deshalb wird hier nichts aus `responses`
 *    geholt, nicht einmal zum Bestaetigen.
 * 2. NUR danke, sonst nichts. Der Weitergabe-Abschnitt ("Handy wandert weiter?"
 *    samt "Leeren Bogen oeffnen") stand hier bis 2026-09; er erklaerte der
 *    abgebenden Person eine Mechanik, die nicht ihr Problem ist, und machte aus
 *    einem Schlusspunkt eine weitere Aufgabe. Der Weg zum leeren Bogen ist
 *    dadurch nicht verloren: wer das Handy weiterreicht, bekommt beim naechsten
 *    Aufruf `ZustandE` mit demselben Knopf — an der Stelle, an der er gebraucht
 *    wird.
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

  return (
    <Huelle titel="Danke." gross fuellt vorTitel={<DankeZeichen />}>
      <div className={`${s.zustand} ${s.aufbau}`}>
        <p className={s.text}>Deine Rückmeldung ist eingegangen — anonym.</p>
      </div>
    </Huelle>
  );
}
