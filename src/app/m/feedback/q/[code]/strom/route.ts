// SSE-STROM DES HANDYS. Erst der volle Stand, dann bei jeder Meldung (§5.4). Die Teilnahme kommt
// aus dem Cookie beim Verbinden: wer erst danach beitritt, verbindet neu. Das Handy sieht die
// Lösung erst ab der Auflösung (`handySicht`). Schreibt nichts außer dem nachgeholten Auto-Ende.
import { getDb } from "@/app/m/feedback/_db/client";
import {
  offeneRundePerCode,
  teilnahmePerToken,
} from "@/app/m/feedback/_db/quiz";
import {
  CODE_MAX,
  cookieWert,
  fehler,
  quizCookie,
} from "@/app/m/feedback/_lib/quiz/http";
import { handySicht } from "@/app/m/feedback/_lib/quiz/sichten";
import { sseAntwort } from "@/app/m/feedback/_lib/quiz/sse";
import { holeAutoEndeNach, leseStand } from "@/app/m/feedback/_lib/quiz/stand";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const db = getDb();
  const jetzt = new Date();
  holeAutoEndeNach(db, jetzt);
  const runde =
    code.length <= CODE_MAX ? offeneRundePerCode(db, code, jetzt) : undefined;
  if (!runde) return fehler(404, "unbekannt");
  const token = cookieWert(req, quizCookie(runde.id));
  const teilnahmeId = token ? teilnahmePerToken(db, runde.id, token) : null;

  return sseAntwort(req.signal, runde.id, () => {
    const stand = leseStand(db, runde.id);
    // Beendet (oder gelöscht): `event: ende`, das Handy zeigt „Quiz ist beendet".
    if (!stand || stand.daten.runde.beendetAt !== null) return null;
    return handySicht(stand.daten, stand.titel, teilnahmeId, new Date());
  });
}
