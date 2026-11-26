import { cache } from "react";
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
 *
 * EINMAL JE REQUEST: Layout und Seite rufen es beide; React `cache()` legt die zweite Abfrage auf
 * die erste. Der Schlüssel sind die drei URL-Teile als Zeichenketten — das `params`-Promise von
 * Layout und Seite muss nicht dasselbe Objekt sein.
 */
export async function ladeAuswertung(params: Promise<{ groupId: string; eveningId: string; rundeId: string }>) {
  const p = await params;
  return ladeAuswertungEinmal(p.groupId, p.eveningId, p.rundeId);
}

const ladeAuswertungEinmal = cache(async (groupId: string, eveningId: string, rundeIdText: string) => {
  const [urlGroup, urlEvening, rundeId] = [Number(groupId), Number(eveningId), Number(rundeIdText)];
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
});
