import type { FahrzeugeDb } from "../_db/client";
import { stammfahrzeug } from "../_db/schema";
import { speichereFahrzeug } from "./daten";
import { fahrzeugEingabe } from "./eingabe";

/**
 * Beispielfahrzeuge, abgestimmt auf die Demodaten der anderen Module: die Funkkenner wie in
 * `einsatzbuch/_lib/stammdaten/vorlage.ts` (`VORLAGE_FAHRZEUGE`), die Kennzeichen wie die Fahrzeuge in
 * `lagerbuch/_lib/seedLokal.ts`. So hat der spätere Erstimport (IDA-256) lokal etwas zum Zuordnen.
 */
const BEISPIELE = [
  { art: "fahrzeug", typ: "ELW 1", funkrufname: "Rotkreuz Uelzen 11-11-1", funkkenner: "11-11-1", kennzeichen: "", standort: "Uelzen" },
  { art: "fahrzeug", typ: "RTW", funkrufname: "Rotkreuz Uelzen 11-83-1", funkkenner: "11-83-1", kennzeichen: "HN-DRK-1101", standort: "Uelzen" },
  { art: "fahrzeug", typ: "KTW-B", funkrufname: "Rotkreuz Uelzen 11-85-1", funkkenner: "11-85-1", kennzeichen: "HN-DRK-1201", standort: "Uelzen" },
  { art: "fahrzeug", typ: "MTF", funkrufname: "Rotkreuz Uelzen 11-19-1", funkkenner: "11-19-1", kennzeichen: "HN-DRK-1401", standort: "Uelzen" },
  { art: "fahrzeug", typ: "GW-San", funkrufname: "Rotkreuz Bad Bevensen 12-64-1", funkkenner: "12-64-1", kennzeichen: "", standort: "Bad Bevensen" },
  { art: "anhaenger", typ: "Anhänger Betreuung", funkrufname: "Anhänger Betreuung Uelzen", funkkenner: "", kennzeichen: "", standort: "Uelzen" },
] as const;

/**
 * Lokale Demodaten — bewusst NICHT am Boot (`bootstrap.ts`, Eintrag fahrzeuge). Idempotent: steht schon
 * ein Fahrzeug im Bestand, bleibt alles, wie es ist (additiv, nichts wird überschrieben).
 */
export async function seedLokalFahrzeuge(db: FahrzeugeDb): Promise<string[]> {
  if (db.select({ id: stammfahrzeug.id }).from(stammfahrzeug).limit(1).get()) return ["fahrzeuge: Bestand vorhanden, nichts geändert"];
  for (const b of BEISPIELE) speichereFahrzeug(db, null, fahrzeugEingabe.parse({ ...b, bemerkung: "", aktiv: true }));
  return [`fahrzeuge: ${BEISPIELE.length} Beispielfahrzeuge angelegt`];
}
