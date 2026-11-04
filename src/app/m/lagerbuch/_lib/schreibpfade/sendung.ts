/**
 * DER WIEDERHOLUNGSSCHUTZ DER HELFER-BUCHUNGEN — IDA-358.
 *
 * Die Helfer-Strecken senden über `core/entwurf`: eine Sendung bleibt auf dem
 * Gerät, bis der Server sie bestätigt hat, und wird nach einem Wurf (Netz weg,
 * Rollout) mit DERSELBEN `sendungId` wiederholt. Kam der erste Versuch an und
 * ging nur die Antwort verloren, darf der zweite nicht noch einmal buchen — das
 * Journal ist append-only, eine Doppelbuchung wäre nur mit einer
 * Gegenkorrektur zu heilen.
 *
 * ⚠️ DIE SENDUNG STECKT IN DEN IDS DER JOURNALZEILEN, NICHT IN EINER SPALTE.
 * Jede Zeile eines Vorgangs heißt `<sendungId>:<n>`; eine Wiederholung findet
 * sie über den Primärschlüssel (Bereichsabfrage, kein LIKE) und antwortet mit
 * dem, was damals gebucht wurde. Das kostet keine Migration, und der
 * Primärschlüssel ist zugleich die harte Grenze: zwei gleichzeitige Versuche
 * mit derselben ID scheitern im zweiten an `:0`, bevor er etwas schreibt.
 *
 * ⚠️ `referenz` UND `kommentar` BLEIBEN UNBERÜHRT: die Präfixe dort sind
 * Vertrag (`_db/schema.ts`, Tabelle `buchungen`), und der Kommentar steht im
 * Journal. Die IDs sieht niemand; sie sind nur Tiebreaker der Sortierung.
 */
import { and, asc, gte, lt } from "drizzle-orm";
import type { DB } from "../../_db/client";
import { buchungen, newId } from "../../_db/schema";
import type { Tx } from "./abbuchung";

/** Erzeugt die ID jeder neuen Journalzeile eines Vorgangs. */
export type IdQuelle = () => string;

/** Ohne Sendung `newId()` wie bisher, mit Sendung `<sendungId>:0`, `:1`, … */
export function sendungsIds(sendungId: string | null | undefined): IdQuelle {
  if (!sendungId) return newId;
  let n = 0;
  return () => `${sendungId}:${n++}`;
}

export type SendungsZeile = typeof buchungen.$inferSelect;

/**
 * Die Journalzeilen, die eine frühere Sendung geschrieben hat — leer, wenn sie
 * nie ankam (oder nichts gebucht hat, etwa bei leerem Handlager).
 *
 * `:` ist 0x3A, `;` 0x3B: der Bereich `[id:, id;)` enthält genau die IDs mit
 * dem Präfix `id:`.
 */
export function zeilenDerSendung(db: DB | Tx, sendungId: string): SendungsZeile[] {
  return db.select().from(buchungen)
    .where(and(gte(buchungen.id, `${sendungId}:`), lt(buchungen.id, `${sendungId};`)))
    .orderBy(asc(buchungen.id))
    .all();
}

/** Was eine frühere Sendung abgebucht hat: die Summe der Abgänge. */
export function abgangDerSendung(zeilen: readonly SendungsZeile[]): number {
  return zeilen.reduce((summe, z) => (z.menge < 0 ? summe - z.menge : summe), 0);
}
