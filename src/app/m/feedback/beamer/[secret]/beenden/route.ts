// „QUIZ BEENDEN" vom Beamer: endgültig (§5.3) — `beendet_at`, alle `token_hash` NULL, der
// Beitrittscode gilt nicht mehr. Ohne offene Runde von heute ändert sich nichts (idempotent).
import { withAuditContext } from "@/core/audit/server";
import { getDb } from "@/app/m/feedback/_db/client";
import {
  beendeRunde,
  heutigeRunde,
  quizPerSecret,
} from "@/app/m/feedback/_db/quiz";
import { tokenHash } from "@/app/m/feedback/_lib/quiz/codes";
import { steuerGrenze } from "@/app/m/feedback/_lib/quiz/grenzen";
import { SECRET_MAX, fehler, json } from "@/app/m/feedback/_lib/quiz/http";
import { holeAutoEndeNach, meldeRunde } from "@/app/m/feedback/_lib/quiz/stand";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ secret: string }> },
) {
  const { secret } = await params;
  return withAuditContext({ actor: { kind: "anonymous" } }, async () => {
    const db = getDb();
    const quiz =
      secret.length <= SECRET_MAX ? quizPerSecret(db, secret) : undefined;
    if (!quiz) return fehler(404, "unbekannt");
    if (!steuerGrenze.check(tokenHash(secret))) return fehler(429, "zu_viele");
    const jetzt = new Date();
    holeAutoEndeNach(db, jetzt);
    const runde = heutigeRunde(db, quiz.id, jetzt);
    if (runde && runde.beendetAt === null) {
      beendeRunde(db, runde.id, jetzt);
      meldeRunde(runde);
    }
    return json({ ok: true });
  });
}
