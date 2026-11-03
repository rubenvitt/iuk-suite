import { getDb } from "../../_db/client";
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

export function starteFeedbackHintergrund(): void {
  if (gestartet) return;
  gestartet = true;
  const erst = setTimeout(() => {
    ehrlichAufraeumen();
    setInterval(() => ehrlichAufraeumen(), TAKT_MS).unref?.();
  }, ERSTLAUF_MS);
  erst.unref?.();
}
