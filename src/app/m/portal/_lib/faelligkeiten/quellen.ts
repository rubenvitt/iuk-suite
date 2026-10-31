/**
 * DIE QUELLEN VON „WAS STEHT AN" (IDA-297) — je Modul genau eine Datei, die es dafür veröffentlicht
 * (`<modul>/_lib/faelligkeiten.ts`). Das Portal liest nie eine fremde Datenbank oder ein fremdes Schema.
 *
 * Eine neue Quelle (etwa die Fahrzeugtermine der Fahrzeugakte) ist ein Eintrag hier plus ihre Datei im
 * Modul. `darfSehen` ist das Prädikat, mit dem das Modul selbst seine Verwaltung riegelt — Seite,
 * Kachel und Riegel des Moduls müssen dieselbe Antwort geben.
 */
import type { Faelligkeit } from "@/core/faelligkeiten";
import { darfLagerbuchFaelligkeitenSehen, lagerbuchFaelligkeiten } from "@/app/m/lagerbuch/_lib/faelligkeiten";
import { darfRadioFaelligkeitenSehen, radioFaelligkeiten } from "@/app/m/radio/_lib/faelligkeiten";

export interface FaelligkeitsQuelle {
  /** Modul-Schlüssel aus `core/registry.ts` — daraus entsteht die Adresse der Links. */
  modul: string;
  /** Wie das Modul auf dem Bildschirm heißt. */
  titel: string;
  darfSehen: (groups: readonly string[] | null | undefined) => boolean;
  lesen: (jetzt: Date) => Faelligkeit[];
}

export const QUELLEN: readonly FaelligkeitsQuelle[] = [
  { modul: "lagerbuch", titel: "Lagerbuch", darfSehen: darfLagerbuchFaelligkeitenSehen, lesen: (j) => lagerbuchFaelligkeiten(j) },
  { modul: "radio", titel: "Funkgeräte", darfSehen: darfRadioFaelligkeitenSehen, lesen: (j) => radioFaelligkeiten(j) },
];
