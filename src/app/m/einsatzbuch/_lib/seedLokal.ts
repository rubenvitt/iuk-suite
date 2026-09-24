import type { EinsatzbuchDb } from "../_db/client";

/**
 * Lokale Demodaten — bewusst NICHT am Boot (siehe `MODULE_MIGRATIONS`, Eintrag einsatzbuch).
 * Stufe 1 hat noch keine Tabellen außer der Audit-Outbox; Stufe 2 füllt hier Fahrzeuge,
 * Personal und Alarmstichworte aus der Vorlage und legt ein Entwicklungs-Schlüsselpaar an.
 */
export async function seedLokalEinsatzbuch(_db: EinsatzbuchDb): Promise<string[]> {
  return ["einsatzbuch: keine Tabellen mit Demodaten (Stammdaten folgen mit Stufe 2)"];
}
