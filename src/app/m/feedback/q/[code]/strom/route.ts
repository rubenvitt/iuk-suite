// SSE-STROM DES HANDYS. Erst der volle Stand, dann bei jeder Meldung (§5.4). Die Teilnahme kommt
// aus dem Cookie beim Verbinden: wer erst danach beitritt, verbindet neu. Das Handy sieht die
// Lösung erst ab der Auflösung (`handySicht`). Schreibt nichts außer dem nachgeholten Auto-Ende.
//
// `?pruefen=1` abonniert nichts: 204, solange die Runde offen ist, sonst 404. So fragt das Handy
// nach einem geschlossenen Strom, ob es die Runde noch gibt, ohne einen Platz im Verteiler zu
// belegen (`Handy.tsx`).
import { clientIpAus } from "@/core/ratelimit";
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
import { probeGrenze } from "@/app/m/feedback/_lib/quiz/grenzen";
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
    code.length <= CODE_MAX ? offeneRundePerCode(db, code) : undefined;
  if (!runde) {
    // Ein Fehlgriff zählt gegen die Adresse (`probeGrenze`, eigener Zähler neben dem Beitritt),
    // sonst wäre der Strom ein Orakel zum Durchprobieren von Codes.
    return probeGrenze.check(clientIpAus(req.headers))
      ? fehler(404, "unbekannt")
      : fehler(429, "zu_viele");
  }
  if (new URL(req.url).searchParams.has("pruefen"))
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  const token = cookieWert(req, quizCookie(runde.id));
  const teilnahmeId = token ? teilnahmePerToken(db, runde.id, token) : null;

  return sseAntwort(req.signal, runde.id, () => {
    const stand = leseStand(db, runde.id);
    // Beendet (oder gelöscht): `event: ende`, das Handy zeigt „Quiz ist beendet".
    if (!stand || stand.daten.runde.beendetAt !== null) return null;
    return handySicht(stand.daten, stand.titel, teilnahmeId, new Date());
  });
}
