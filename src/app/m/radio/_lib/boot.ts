// src/app/m/radio/_lib/boot.ts
// KEIN "use client" (Falle 6).
//
// ⚠️ DIESE DATEI TRAEGT AM ENDE ZWEI EXPORTGRUPPEN AUS ZWEI PLANTEILEN, und die
// Reihenfolge ist Pflicht (Spec 1 B8):
//   * Kapitel 2 (HIER): `retentionGrenze`, `raeumeLeihhistorie` — die Rechnung.
//   * Kapitel 7 (Planteil 5): `radioBootFehler()`, das VOR den Migrationen laeuft und
//     keine Tabelle liest, und `starteRadioHintergrund()`/`stoppeRadioHintergrund()`
//     samt RADIO_HISTORIE_MONATE/_PURGE/_ERSTLAUF_MINUTEN, die DANACH laufen und die
//     Tabelle brauchen.
// Zwei Ruempfe fuer denselben Takt waeren zwei Timer in einer Datei und zwei Laeufe je
// Takt — deshalb steht der Takt hier NICHT, auch nicht "vorlaeufig".
import { and, isNotNull, lt } from "drizzle-orm";
import type { DB } from "../_db/client";
import { loans } from "../_db/schema";

/** Vorbelegung von `RADIO_HISTORIE_MONATE` (§7.4.1). Der Takt und die Umgebungsvariable
 *  liegen in Planteil 5 — dieselbe Datei, aber nicht dieser Abschnitt.
 *
 *  Uebernommen wird die Regel `HISTORY_RETENTION_MONTHS = 2`
 *  (radio-admin/server/src/services/retentionService.ts:9). Der Grund steht dort im
 *  Kommentar und ist der einzige, der zaehlt: `borrower_name` ist personenbezogen, und das
 *  Loeschen ist eine ausdrueckliche geplante Richtlinie, keine Nebenwirkung davon, dass
 *  jemand die Historie liest. */
export const RETENTION_MONATE_VORGABE = 2;

/**
 * Der Cutoff als DATE, nicht als Millisekundenzahl (§2.7.4). Rein und testbar.
 *
 * WARUM `Date` UND NICHT `number`: die eigentliche Gefahr ist ein falscher Cutoff, und er
 * hat zwei Gestalten — die Einheit und das Vorzeichen. Eine `Date`-Grenze kann keinen
 * Faktor 1000 tragen, weil Drizzle die Umrechnung fuer `mode: "timestamp"` selbst besorgt.
 * Spec 1 B16 hat aus genau diesem Grund eine `number`-Fassung gestrichen: "eine Zahl ist
 * in eine `mode: \"timestamp\"`-Spalte nicht einfuegbar — das haette erst der erste echte
 * Insert gezeigt, nie der Mapper-Test."
 *
 * `monate` kommt aus `RADIO_HISTORIE_MONATE` (Planteil 5) — der Aufrufer reicht ihn durch,
 * diese Funktion liest KEINE Umgebung.
 */
export function retentionGrenze(jetzt: Date = new Date(), monate = RETENTION_MONATE_VORGABE): Date {
  const d = new Date(jetzt.getTime());
  d.setUTCMonth(d.getUTCMonth() - monate);
  return d;
}

/**
 * Ein Lauf. Gibt die Zahl geloeschter Zeilen zurueck. WIRFT NICHT.
 *
 * ZU OFT IST HARMLOS: der Cutoff ist zeitbasiert und der DELETE idempotent; zwei Laeufe in
 * einer Minute loeschen dieselbe leere Menge. Die Kosten sind ein indizierter DELETE ueber
 * `loans_returned_at_idx`.
 *
 * NIE IST EINE RICHTLINIEN-ABWEICHUNG, KEIN FUNKTIONSAUSFALL: `borrower_name` sammelt sich
 * ueber die Zwei-Monats-Richtlinie hinaus an, nichts bricht. Feststellbar mit
 * `SELECT COUNT(*) FROM loans WHERE returned_at IS NOT NULL
 *  AND returned_at < unixepoch('now','-2 months');` — sie gehoert als wiederkehrende
 * Pruefung ins Runbook (Zusage an Spec 2), weil ein stehengebliebener Timer sich nicht von
 * selbst meldet.
 *
 * AKTIVE LEIHEN BLEIBEN, IMMER: `isNotNull(returnedAt)` ist die halbe Zusage von §2.7.4.
 */
export function raeumeLeihhistorie(db: DB, jetzt?: Date, monate?: number): number {
  const grenze = retentionGrenze(jetzt, monate);
  const ergebnis = db
    .delete(loans)
    .where(and(isNotNull(loans.returnedAt), lt(loans.returnedAt, grenze)))
    .run();
  return ergebnis.changes;
}
