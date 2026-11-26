import { getDb } from "../../_db/client";
import { quizAutoEndeBeimStart } from "../quiz/autoEnde";
import { loescheAbgelaufene, tagVon } from "./daten";

/**
 * DIE LÖSCHFRIST (Entscheidung an IDA-314): erledigte Mitteilungen verschwinden `LOESCHFRIST_MONATE` nach dem
 * Erledigt-Tag, samt Gespräch und Notizen (Fremdschlüssel mit `ON DELETE CASCADE`). Alle sechs Stunden, der
 * erste Lauf zehn Minuten nach dem Start — ein Löschlauf soll nicht mit dem Deploy zusammenfallen.
 * Synchron, `unref`, wirft nie.
 */
const TAKT_MS = 6 * 60 * 60_000;
const ERSTLAUF_MS = 10 * 60_000;
let gestartet = false;

export function ehrlichAufraeumen(jetzt = Date.now()): number {
  try {
    return loescheAbgelaufene(getDb(), tagVon(jetzt));
  } catch (fehler) {
    console.error("[feedback][ehrlich] Löschfrist nicht angewandt:", fehler instanceof Error ? fehler.message : fehler);
    return 0;
  }
}

/**
 * Ein Takt: Löschfrist und Live-Quiz-Auto-Ende (§5.3). Das Auto-Ende läuft sonst nur beim Zugriff
 * auf einen Quizweg und beim Start; ohne diesen Takt stünde eine Runde, nach der niemand mehr
 * einen Quizweg aufruft, bis zum nächsten Neustart offen (und mit ihr die `token_hash`). Beide
 * Aufrufe werfen nie.
 */
function takt(): void {
  ehrlichAufraeumen();
  quizAutoEndeBeimStart();
}

export function starteFeedbackHintergrund(): void {
  if (gestartet) return;
  gestartet = true;
  // Live-Quiz: Abgelaufene Runden sofort beenden (§5.3), nicht erst beim ersten Zugriff.
  quizAutoEndeBeimStart();
  const erst = setTimeout(() => {
    takt();
    setInterval(takt, TAKT_MS).unref?.();
  }, ERSTLAUF_MS);
  erst.unref?.();
}
