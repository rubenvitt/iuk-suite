/**
 * DIE STANDORTE DER FUNKGERÄTE FÜR DEN ERSTIMPORT DER FAHRZEUGVERWALTUNG (IDA-256,
 * `fahrzeuge/_lib/erstimport/`). Das Modul fahrzeuge liest weder diese Datenbank noch ihr Schema,
 * sondern nur, was hier herausgegeben wird.
 *
 * Die Geräte kennen kein Fahrzeugfeld: ein Fahrzeug ist hier ein Wert von `devices.location`, und daneben
 * stehen Orte, die keines sind („Fahrzeughalle“). Herausgegeben wird deshalb jeder Ort mit der Zahl seiner
 * Geräte, gruppiert wie im Update-Modus (`lesepfade/geraete.ts`, `updateFahrzeuge`): getrimmt, leer
 * zählt nicht, ausgemusterte Geräte zählen nicht. Was davon ein Fahrzeug ist, entscheidet die Vorschau.
 */
import { count, sql } from "drizzle-orm";
import { getDb, type DB } from "../_db/client";
import { devices } from "../_db/schema";

export interface FunkgeraeteOrt {
  /** Der getrimmte Ort, so wie er in den Geräten steht. Er ist zugleich die Kennung für die Zuordnung. */
  ort: string;
  geraete: number;
}

export function funkgeraeteOrte(db: DB = getDb()): FunkgeraeteOrt[] {
  const ort = sql<string | null>`NULLIF(TRIM(${devices.location}), '')`;
  return db.select({ ort, geraete: count() }).from(devices)
    .where(sql`LOWER(TRIM(COALESCE(${devices.status}, ''))) <> 'ausgemustert'`)
    .groupBy(ort)
    .all()
    .flatMap((z) => (z.ort ? [{ ort: z.ort, geraete: z.geraete }] : []));
}
