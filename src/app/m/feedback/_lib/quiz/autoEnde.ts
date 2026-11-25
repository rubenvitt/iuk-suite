// AUTO-ENDE BEIM START DES SERVERS (§5.3): neben dem Nachholen bei jedem Zugriff auf einen Quizweg.
// So hält das Lagebild sein Anonymitätsversprechen (`token_hash` NULL) auch dann spätestens am
// Folgetag, wenn nach dem Abend niemand mehr einen Quizweg aufruft, der Server aber neu startet.
// Gerufen aus `starteFeedbackHintergrund` (`_lib/ehrlich/hintergrund.ts`), also nach den Migrationen.
import { getDb } from "@/app/m/feedback/_db/client";
import { holeAutoEndeNach } from "./stand";

/** Wirft nie: ein Fehler hier darf den Start der Suite nicht aufhalten. Liefert die Zahl beendeter Runden. */
export function quizAutoEndeBeimStart(jetzt = new Date()): number {
  try {
    return holeAutoEndeNach(getDb(), jetzt).length;
  } catch (fehler) {
    console.error(
      "[feedback][quiz] Auto-Ende beim Start nicht nachgeholt:",
      fehler instanceof Error ? fehler.message : fehler,
    );
    return 0;
  }
}
