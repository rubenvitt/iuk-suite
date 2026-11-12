/**
 * DIE QUELLEN VON „WAS STEHT AN" (IDA-297) — je Modul genau eine Datei, die es dafür veröffentlicht
 * (`<modul>/_lib/faelligkeiten.ts`). Das Portal liest nie eine fremde Datenbank oder ein fremdes Schema.
 *
 * Eine neue Quelle (zuletzt die Fahrzeugtermine der Fahrzeugakte, IDA-299) ist ein Eintrag hier plus ihre Datei im
 * Modul. `darfSehen` ist das Prädikat, mit dem das Modul selbst seine Verwaltung riegelt — Seite,
 * Kachel und Riegel des Moduls müssen dieselbe Antwort geben.
 */
import type { Faelligkeit, Sofortmeldung } from "@/core/faelligkeiten";
import {
  darfLagerbuchFaelligkeitenSehen, LAGERBUCH_FAELLIGKEITS_ARTEN, lagerbuchFaelligkeiten,
  lagerbuchSofortmeldungen, vermerkeLagerbuchSofortmeldungen,
} from "@/app/m/lagerbuch/_lib/faelligkeiten";
import {
  darfFeedbackFaelligkeitenSehen, FEEDBACK_FAELLIGKEITS_ARTEN, feedbackFaelligkeiten, feedbackSofortmeldungen,
  vermerkeFeedbackSofortmeldungen,
} from "@/app/m/feedback/_lib/faelligkeiten";
import { darfRadioFaelligkeitenSehen, RADIO_FAELLIGKEITS_ARTEN, radioFaelligkeiten } from "@/app/m/radio/_lib/faelligkeiten";
import {
  darfWartungFaelligkeitenSehen, vermerkeWartungSofortmeldungen, WARTUNG_FAELLIGKEITS_ARTEN, wartungFaelligkeiten,
  wartungSofortmeldungen,
} from "@/app/m/wartung/_lib/faelligkeiten";
import {
  darfVerpflegungFaelligkeitenSehen, vermerkeVerpflegungSofortmeldungen, VERPFLEGUNG_FAELLIGKEITS_ARTEN, verpflegungFaelligkeiten,
  verpflegungSofortmeldungen,
} from "@/app/m/verpflegung/_lib/faelligkeiten";
import {
  darfFahrzeugeFaelligkeitenSehen, FAHRZEUGE_FAELLIGKEITS_ARTEN, fahrzeugeFaelligkeiten,
} from "@/app/m/fahrzeuge/_lib/faelligkeiten";

export interface FaelligkeitsQuelle {
  /** Modul-Schlüssel aus `core/registry.ts` — daraus entsteht die Adresse der Links. */
  modul: string;
  /** Wie das Modul auf dem Bildschirm heißt. */
  titel: string;
  /** Alle Arten, die `lesen` herausgeben kann — daraus entsteht die Auswahl fürs Telefon. */
  arten: readonly string[];
  darfSehen: (groups: readonly string[] | null | undefined) => boolean;
  lesen: (jetzt: Date) => Faelligkeit[];
  /**
   * IDA-298: was nicht bis Montag warten soll (`sofort.ts`). `lesen` gibt nur noch nicht Vermerktes ab
   * `seit` heraus, `vermerken` hält den Versand im Modul fest — sonst ginge dieselbe Meldung nach jedem
   * Neustart noch einmal hinaus.
   */
  sofort?: {
    lesen: (seit: Date) => Sofortmeldung[];
    vermerken: (ids: readonly string[], jetzt: Date) => void;
  };
}

export const QUELLEN: readonly FaelligkeitsQuelle[] = [
  { modul: "lagerbuch", titel: "Lagerbuch", arten: LAGERBUCH_FAELLIGKEITS_ARTEN, darfSehen: darfLagerbuchFaelligkeitenSehen, lesen: (j) => lagerbuchFaelligkeiten(j),
    sofort: { lesen: (seit) => lagerbuchSofortmeldungen(seit), vermerken: (ids, j) => vermerkeLagerbuchSofortmeldungen(ids, j) } },
  { modul: "radio", titel: "Funkgeräte", arten: RADIO_FAELLIGKEITS_ARTEN, darfSehen: darfRadioFaelligkeitenSehen, lesen: (j) => radioFaelligkeiten(j) },
  // IDA-299: HU, UVV, Service, weitere Prüfungen und Reifen aus der Fahrzeugakte; nur für die Admin-Gruppe des Moduls.
  { modul: "fahrzeuge", titel: "Fahrzeuge", arten: FAHRZEUGE_FAELLIGKEITS_ARTEN, darfSehen: darfFahrzeugeFaelligkeitenSehen, lesen: (j) => fahrzeugeFaelligkeiten(j) },
  // IDA-312: die Einträge tragen `sichtbarFuer` — jede Gruppe sieht nur ihre Geräte.
  { modul: "wartung", titel: "Gerätewartung", arten: WARTUNG_FAELLIGKEITS_ARTEN, darfSehen: (g) => darfWartungFaelligkeitenSehen(g), lesen: (j) => wartungFaelligkeiten(j),
    sofort: { lesen: (seit) => wartungSofortmeldungen(seit), vermerken: (ids, j) => vermerkeWartungSofortmeldungen(ids, j) } },
  // IDA-316: rote MHD-Ampel; die Tagesmeldung ab 07:00 rechnet mit der Uhrzeit von jetzt, nicht mit `seit`.
  { modul: "verpflegung", titel: "Verpflegungslager", arten: VERPFLEGUNG_FAELLIGKEITS_ARTEN, darfSehen: darfVerpflegungFaelligkeitenSehen,
    lesen: (j) => verpflegungFaelligkeiten(j),
    sofort: { lesen: () => verpflegungSofortmeldungen(new Date()), vermerken: (ids, j) => vermerkeVerpflegungSofortmeldungen(ids, j) } },
  // IDA-314: „Ehrlich gesagt" hat keine Fristen, nur den Sofort-Push an die Vertrauenspersonen (ohne Inhalt).
  { modul: "feedback", titel: "Ehrlich gesagt", arten: FEEDBACK_FAELLIGKEITS_ARTEN, darfSehen: darfFeedbackFaelligkeitenSehen, lesen: () => feedbackFaelligkeiten(),
    sofort: { lesen: (seit) => feedbackSofortmeldungen(seit), vermerken: (ids) => vermerkeFeedbackSofortmeldungen(ids) } },
];
