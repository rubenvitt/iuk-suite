"use client";

import type { VerwaltungscheckDaten } from "../../../../../_lib/lesepfade/verwaltungscheck";

/**
 * PLATZHALTER — die Insel der Zählseite. Task 8 ersetzt ihn durch die Reiter
 * (Bestand, Ausgleichen, Plomben, Geräte, Sauerstoff) und die Abschlussleiste.
 */
export function VerwaltungsZaehlung({ daten }: { daten: VerwaltungscheckDaten }) {
  return <h2>Zählen: {daten.fahrzeug.name}</h2>;
}
