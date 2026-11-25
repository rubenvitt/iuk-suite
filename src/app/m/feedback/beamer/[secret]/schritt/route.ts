// „GEHE ZU SCHRITT n" (Beamer, Slidev). Der erste Schritt legt die Runde an, ein Schritt nach dem
// Beenden eine neue (§5.3); zwei Tabs mit demselben Secret landen in derselben Runde (Review Focus 1).
import { withAuditContext } from "@/core/audit/server";
import { getDb } from "@/app/m/feedback/_db/client";
import { TagBelegt } from "@/app/m/feedback/_db/queries";
import {
  QuizFragenUngueltig,
  quizPerSecret,
  setzeSchritt,
  starteOderHoleRunde,
} from "@/app/m/feedback/_db/quiz";
import { tokenHash } from "@/app/m/feedback/_lib/quiz/codes";
import { steuerGrenze } from "@/app/m/feedback/_lib/quiz/grenzen";
import {
  SECRET_MAX,
  fehler,
  istObjekt,
  json,
  leseJson,
  nurSchluessel,
} from "@/app/m/feedback/_lib/quiz/http";
import { beamerSicht } from "@/app/m/feedback/_lib/quiz/sichten";
import {
  holeAutoEndeNach,
  leseStand,
  meldeRunde,
  planeZeitende,
} from "@/app/m/feedback/_lib/quiz/stand";

/** Weit über jeder Schrittzahl; `setzeSchritt` klemmt ohnehin auf die letzte. */
const SCHRITT_MAX = 10_000;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ secret: string }> },
) {
  const { secret } = await params;
  return withAuditContext({ actor: { kind: "anonymous" } }, async () => {
    const db = getDb();
    const quiz =
      secret.length <= SECRET_MAX ? quizPerSecret(db, secret) : undefined;
    if (!quiz) return fehler(404, "unbekannt");
    const body = await leseJson(req);
    const wert = body.ok ? body.wert : null;
    if (!istObjekt(wert) || !nurSchluessel(wert, ["schritt"]))
      return fehler(400, "ungueltig");
    const { schritt } = wert;
    if (
      typeof schritt !== "number" ||
      !Number.isInteger(schritt) ||
      schritt < 0 ||
      schritt > SCHRITT_MAX
    ) {
      return fehler(400, "ungueltig");
    }
    if (!steuerGrenze.check(tokenHash(secret))) return fehler(429, "zu_viele");

    const jetzt = new Date();
    holeAutoEndeNach(db, jetzt);
    let runde;
    try {
      runde = starteOderHoleRunde(db, quiz, jetzt);
    } catch (e) {
      // Ein abgesagter Abend von heute: die Tagesregel lässt keinen zweiten zu (DRK-429).
      if (e instanceof TagBelegt) return fehler(409, "tag_belegt");
      // Ein Entwurf ohne (gültige) Fragen startet nicht.
      if (e instanceof QuizFragenUngueltig)
        return fehler(409, "fragen_ungueltig");
      throw e;
    }
    runde = setzeSchritt(db, runde.id, schritt, jetzt);
    meldeRunde(runde);

    const stand = leseStand(db, runde.id);
    if (!stand) return fehler(404, "unbekannt");
    const sicht = beamerSicht(stand.daten, quiz.titel, jetzt);
    if (
      sicht.phase.art === "frage" &&
      sicht.phase.offen &&
      sicht.phase.endetUm !== null
    ) {
      planeZeitende(runde, sicht.phase.endetUm);
    }
    return json(sicht);
  });
}
