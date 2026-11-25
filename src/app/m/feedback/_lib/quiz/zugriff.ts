import { notFound } from "next/navigation";
import { getDb } from "@/app/m/feedback/_db/client";
import { getEvening, getGroup } from "@/app/m/feedback/_db/queries";
import { rundenStand } from "@/app/m/feedback/_db/quiz";
import { guardPage } from "@/app/m/feedback/_lib/guardPage";

/**
 * Zugriff auf die Auswertung einer Runde. Runde → Abend → Gruppe kommen aus der Datenbank, nie
 * aus der URL (IDOR); die URL-Teile müssen nur dazu passen, sonst 404 (kein Hinweis, dass es
 * die Runde unter einer anderen Gruppe gibt). Lesend: das Layout über der Seite ruft es auch
 * beim Vorabladen auf (Falle 23, `CLAUDE.md`).
 */
export async function ladeAuswertung(params: Promise<{ groupId: string; eveningId: string; rundeId: string }>) {
  const p = await params;
  const [urlGroup, urlEvening, rundeId] = [Number(p.groupId), Number(p.eveningId), Number(p.rundeId)];
  if (![urlGroup, urlEvening, rundeId].every(Number.isInteger)) notFound();

  const stand = rundenStand(getDb(), rundeId);
  if (!stand) notFound();
  const evening = getEvening(getDb(), stand.daten.runde.eveningId);
  if (!evening) notFound();
  // Guard gegen die ECHTE Gruppe des Abends, danach erst der Abgleich mit der URL.
  const { db } = await guardPage(evening.groupId);
  if (evening.groupId !== urlGroup || evening.id !== urlEvening) notFound();
  const group = getGroup(db, evening.groupId);
  if (!group) notFound();
  return { db, group, evening, stand };
}
