/**
 * DIE FAHRZEUGE DES EINSATZBUCHS FÜR DEN ERSTIMPORT DER FAHRZEUGVERWALTUNG (IDA-256,
 * `fahrzeuge/_lib/erstimport/`). Wie `helfer/_lib/bereitstellung.ts`, nur in die Gegenrichtung: das Modul
 * fahrzeuge liest weder diese Datenbank noch ihr Schema, sondern nur, was hier herausgegeben wird.
 *
 * Herausgegeben wird die Zeile, wie sie in den Stammdaten steht, mit ihrer Kennung (`id`) — über sie
 * ordnet die Fahrzeugverwaltung zu, und über sie koppelt sich das Einsatzbuch später an (IDA-257).
 */
import { getDb, type EinsatzbuchDb } from "../_db/client";
import { fahrzeug } from "../_db/schema";

export interface EinsatzbuchFahrzeug {
  id: string;
  typ: string;
  /** Der Funkkenner, z. B. „11-83-1“. */
  kennung: string;
  /** Der Funkrufname, z. B. „Rotkreuz Uelzen 11-83-1“. */
  ruf: string;
  standort: string;
  aktiv: boolean;
}

export function einsatzbuchFahrzeuge(db: EinsatzbuchDb = getDb()): EinsatzbuchFahrzeug[] {
  return db.select({
    id: fahrzeug.id, typ: fahrzeug.typ, kennung: fahrzeug.kennung, ruf: fahrzeug.ruf, standort: fahrzeug.standort, aktiv: fahrzeug.aktiv,
  }).from(fahrzeug).all();
}
