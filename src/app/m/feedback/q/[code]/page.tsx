// HANDY-SEITE DES LIVE-QUIZ (`/q/<beitrittscode>`, QR am Beamer). Öffentlich, ohne Anmeldung:
// der Code ist der Zugang (§5.6). Diese Server Component liest nur den Stand beim Laden und
// reicht ihn als serialisierbare Sicht an `Handy`; alles Weitere kommt aus dem Strom.
//
// Ohne JavaScript steht damit wenigstens der Stand beim Laden da, insbesondere „Das Quiz ist
// beendet.“ für einen beendeten oder unbekannten Code — gleiche Antwort für beide, die Seite
// ist kein Orakel für geratene Codes. Ein Fehlgriff zählt wie bei Strom und Antwort gegen die
// Absenderadresse (`probeGrenze`); gesperrt bleibt es bei derselben Antwort, nie 429.
// Mitmachen braucht JavaScript.
import { cookies, headers } from "next/headers";
import { clientIpAus } from "@/core/ratelimit";
import { getDb } from "@/app/m/feedback/_db/client";
import { offeneRundePerCode, teilnahmePerToken } from "@/app/m/feedback/_db/quiz";
import { CODE_MAX, quizCookie } from "@/app/m/feedback/_lib/quiz/http";
import { probeGrenze } from "@/app/m/feedback/_lib/quiz/grenzen";
import { handySicht, type HandySicht } from "@/app/m/feedback/_lib/quiz/sichten";
import { holeAutoEndeNach, leseStand } from "@/app/m/feedback/_lib/quiz/stand";
import { Handy } from "./Handy";

/** Die Sicht beim Laden, `null` für „beendet oder unbekannt“. Wie der Strom (`strom/route.ts`). */
async function sichtBeimLaden(code: string): Promise<HandySicht | null> {
  const db = getDb();
  const jetzt = new Date();
  holeAutoEndeNach(db, jetzt);
  const runde = code.length <= CODE_MAX ? offeneRundePerCode(db, code) : undefined;
  if (!runde) {
    probeGrenze.check(clientIpAus(await headers()));
    return null;
  }
  const stand = leseStand(db, runde.id);
  if (!stand || stand.daten.runde.beendetAt !== null) return null;
  const token = (await cookies()).get(quizCookie(runde.id))?.value;
  const teilnahmeId = token ? teilnahmePerToken(db, runde.id, token) : null;
  return handySicht(stand.daten, stand.titel, teilnahmeId, jetzt);
}

export default async function QuizHandySeite({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <Handy anfang={await sichtBeimLaden(code)} />;
}

export const metadata = { title: "Live-Quiz" };
