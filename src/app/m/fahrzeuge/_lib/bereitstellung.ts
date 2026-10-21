/**
 * DIE EINE FUNKTION, DIE DAS MODUL FAHRZEUGE FÜR ANDERE MODULE VERÖFFENTLICHT (Epic IDA-254: Einsatzbuch,
 * Lagerbuch und Funkgeräte gleichen ihre Fahrzeuge damit ab).
 *
 * Modul-Interna sind kein API (`docs/design/README.md`, „Die Regel für `src/core`“): ein anderes Modul
 * liest weder diese Datenbank noch ihr Schema, sondern nur, was hier herausgegeben wird — dieselbe Bauform
 * wie `helfer/_lib/bereitstellung.ts`.
 *
 * Herausgegeben werden ALLE Fahrzeuge, auch die deaktivierten, mit ihrem Status: ein Empfänger muss
 * unterscheiden können, ob ein Fahrzeug außer Dienst ist (bei sich deaktivieren) oder es nie gab. Die
 * `bemerkung` bleibt hier — sie ist eine Notiz für die Fahrzeugverwaltung, kein Stammdatum.
 *
 * Wer hier ein Feld ergänzt, prüft zuerst, ob ein Empfänger es wirklich braucht; `bereitstellung.test.ts`
 * hält die Feldliste fest.
 */
import { desc } from "drizzle-orm";
import { getDb, type FahrzeugeDb } from "../_db/client";
import { stammfahrzeug } from "../_db/schema";
import type { Art } from "./eingabe";

export interface BereitgestelltesFahrzeug {
  id: string;
  art: Art;
  typ: string;
  funkrufname: string;
  funkkenner: string | null;
  kennzeichen: string | null;
  standort: string;
  aktiv: boolean;
}

export interface Fahrzeugbereitstellung {
  fahrzeuge: BereitgestelltesFahrzeug[];
  /** Zeitpunkt der letzten Änderung am Bestand (ISO), `null` solange er leer ist. */
  stand: string | null;
}

export function bereitgestellteFahrzeuge(db: FahrzeugeDb = getDb()): Fahrzeugbereitstellung {
  const fahrzeuge = db.select({
    id: stammfahrzeug.id, art: stammfahrzeug.art, typ: stammfahrzeug.typ, funkrufname: stammfahrzeug.funkrufname,
    funkkenner: stammfahrzeug.funkkenner, kennzeichen: stammfahrzeug.kennzeichen, standort: stammfahrzeug.standort,
    aktiv: stammfahrzeug.aktiv,
  }).from(stammfahrzeug).all();
  const juengste = db.select({ am: stammfahrzeug.aktualisiertAm }).from(stammfahrzeug).orderBy(desc(stammfahrzeug.aktualisiertAm)).limit(1).get();
  return { fahrzeuge, stand: juengste?.am.toISOString() ?? null };
}
