/**
 * Was andere Module von den Veranstaltungen lesen dürfen (heute die Schichtplanung): Kopf und Status,
 * nie eine Schreibfunktion. Vorbild `helfer/_lib/bereitstellung.ts` — wer liest, geht hierüber, nie
 * über die Datenbank des Moduls.
 */
import { getDb } from "../_db/client";
import { alleVeranstaltungen, ladeVeranstaltung } from "./daten";
import type { VeranstaltungDTO } from "./typen";

export type BereitgestellteVeranstaltung = Pick<VeranstaltungDTO, "id" | "name" | "art" | "status" | "ort" | "von" | "bis">;

const kopf = (v: VeranstaltungDTO): BereitgestellteVeranstaltung => ({ id: v.id, name: v.name, art: v.art, status: v.status, ort: v.ort, von: v.von, bis: v.bis });

/** Alle Veranstaltungen, frühester Beginn zuerst. */
export function bereitgestellteVeranstaltungen(): BereitgestellteVeranstaltung[] {
  return alleVeranstaltungen(getDb()).map(kopf);
}

/** Eine Veranstaltung oder `null`, wenn es sie (nicht mehr) gibt. */
export function bereitgestellteVeranstaltung(id: string): BereitgestellteVeranstaltung | null {
  const v = ladeVeranstaltung(getDb(), id);
  return v ? kopf(v) : null;
}
