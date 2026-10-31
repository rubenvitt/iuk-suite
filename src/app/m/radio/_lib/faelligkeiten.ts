/**
 * DIE FÄLLIGKEITEN DER FUNKGERÄTE FÜR „WAS STEHT AN" IM PORTAL (IDA-297). Das Portal liest weder diese
 * Datenbank noch ihr Schema, sondern nur, was hier herausgegeben wird — dasselbe Muster wie
 * `fahrzeugbestand.ts`.
 *
 * Eine Ausleihe hat kein Rückgabedatum; „fällig" ist hier also eine Dauer. Ein Gerät wird für einen
 * Dienst oder einen Einsatz ausgeliehen und am selben Tag zurückgegeben. Wer es über Nacht behält,
 * hat es vermutlich vergessen (bald); nach einer Woche ist es überfällig.
 */
import { adminGroupsFor } from "@/core/groups";
import { getModule } from "@/core/registry";
import { tageDativ, type Faelligkeit } from "@/core/faelligkeiten";
import { getDb, type DB } from "../_db/client";
import { offeneAusleihenSeit } from "../_db/leihen";

/** Ab so vielen Stunden steht eine offene Ausleihe in „Was steht an". */
export const AUSLEIHE_BALD_STUNDEN = 24;
/** Ab so vielen Tagen gilt sie als überfällig. */
export const AUSLEIHE_UEBERFAELLIG_TAGE = 7;

const STUNDE_MS = 3_600_000;
const TAG_MS = 24 * STUNDE_MS;

/**
 * Dasselbe Prädikat wie `istRadioAdmin` (`_lib/zugang.ts`) — OHNE den Suite-Admin-Kurzschluss, und
 * das ist hier tragend: die Seite zeigt den Entleiher, und hinter `/admin` liegen Klarnamen, die der
 * Betrieb ohne das Modulrecht nicht sieht.
 */
export function darfRadioFaelligkeitenSehen(groups: readonly string[] | null | undefined): boolean {
  if (!groups) return false;
  const erlaubt = adminGroupsFor(getModule("radio"));
  return groups.some((g) => erlaubt.includes(g));
}

export function radioFaelligkeiten(jetzt: Date, db: DB = getDb()): Faelligkeit[] {
  const bis = new Date(jetzt.getTime() - AUSLEIHE_BALD_STUNDEN * STUNDE_MS);
  return offeneAusleihenSeit(db, bis).map((l): Faelligkeit => {
    const tage = Math.max(1, Math.floor((jetzt.getTime() - l.seit.getTime()) / TAG_MS));
    return {
      id: `leihe:${l.id}`,
      art: "Ausleihe",
      titel: `Funkgerät ${l.rufname}`,
      wo: null,
      zustand: `seit ${tageDativ(tage)} ausgeliehen`,
      dringlichkeit: tage >= AUSLEIHE_UEBERFAELLIG_TAGE ? "ueberfaellig" : "bald",
      sortierung: l.seit.toISOString(),
      pfad: "/admin/ausleihen",
      person: l.entleiher,
    };
  });
}
