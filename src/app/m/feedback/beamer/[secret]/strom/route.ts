// SSE-STROM DES BEAMERS. Zeigt die Runde von heute (offen oder schon beendet), ohne Runde die
// Sicht „vorStart". Das Laden legt NICHTS an (§5.3: Slidev rendert Nachbarfolien vorab) — außer
// dem nachgeholten Auto-Ende schreibt dieser Weg nichts. Gehört wird auf den Kanal des Quiz, nicht
// einer Runde: so kommt die Runde, die der erste Schritt anlegt, ohne Neuverbinden an.
import { getDb } from "@/app/m/feedback/_db/client";
import { heutigeRunde, quizPerSecret } from "@/app/m/feedback/_db/quiz";
import { SECRET_MAX, fehler } from "@/app/m/feedback/_lib/quiz/http";
import { beamerSicht, vorStartSicht } from "@/app/m/feedback/_lib/quiz/sichten";
import { sseAntwort } from "@/app/m/feedback/_lib/quiz/sse";
import {
  holeAutoEndeNach,
  leseStand,
  quizKanal,
} from "@/app/m/feedback/_lib/quiz/stand";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ secret: string }> },
) {
  const { secret } = await params;
  const db = getDb();
  const quiz =
    secret.length <= SECRET_MAX ? quizPerSecret(db, secret) : undefined;
  if (!quiz) return fehler(404, "unbekannt");
  holeAutoEndeNach(db, new Date());

  return sseAntwort(req.signal, quizKanal(quiz.id), () => {
    const jetzt = new Date();
    // Rotiert oder gelöscht: die alte Adresse zeigt nichts mehr.
    const q = quizPerSecret(db, secret);
    if (!q) return null;
    const runde = heutigeRunde(db, q.id, jetzt);
    const stand = runde ? leseStand(db, runde.id) : null;
    return stand
      ? beamerSicht(stand.daten, q.titel, jetzt)
      : vorStartSicht(q.titel, q.modus, q.fragen, jetzt);
  });
}
