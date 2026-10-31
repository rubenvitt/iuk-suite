/**
 * DIE QUELLEN VON „WAS STEHT AN" (IDA-297) — je Modul genau eine Datei, die es dafür veröffentlicht
 * (`<modul>/_lib/faelligkeiten.ts`). Das Portal liest nie eine fremde Datenbank oder ein fremdes Schema.
 *
 * Eine neue Quelle (etwa die Fahrzeugtermine der Fahrzeugakte) ist ein Eintrag hier plus ihre Datei im
 * Modul. `darfSehen` ist das Prädikat, mit dem das Modul selbst seine Verwaltung riegelt — Seite,
 * Kachel und Riegel des Moduls müssen dieselbe Antwort geben.
 */
import type { Faelligkeit } from "@/core/faelligkeiten";
import { darfLagerbuchFaelligkeitenSehen, LAGERBUCH_FAELLIGKEITS_ARTEN, lagerbuchFaelligkeiten } from "@/app/m/lagerbuch/_lib/faelligkeiten";
import { darfRadioFaelligkeitenSehen, RADIO_FAELLIGKEITS_ARTEN, radioFaelligkeiten } from "@/app/m/radio/_lib/faelligkeiten";

export interface FaelligkeitsQuelle {
  /** Modul-Schlüssel aus `core/registry.ts` — daraus entsteht die Adresse der Links. */
  modul: string;
  /** Wie das Modul auf dem Bildschirm heißt. */
  titel: string;
  /** Alle Arten, die `lesen` herausgeben kann — daraus entsteht die Auswahl fürs Telefon. */
  arten: readonly string[];
  darfSehen: (groups: readonly string[] | null | undefined) => boolean;
  lesen: (jetzt: Date) => Faelligkeit[];
}

export const QUELLEN: readonly FaelligkeitsQuelle[] = [
  { modul: "lagerbuch", titel: "Lagerbuch", arten: LAGERBUCH_FAELLIGKEITS_ARTEN, darfSehen: darfLagerbuchFaelligkeitenSehen, lesen: (j) => lagerbuchFaelligkeiten(j) },
  { modul: "radio", titel: "Funkgeräte", arten: RADIO_FAELLIGKEITS_ARTEN, darfSehen: darfRadioFaelligkeitenSehen, lesen: (j) => radioFaelligkeiten(j) },
];
