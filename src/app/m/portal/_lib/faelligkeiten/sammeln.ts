/**
 * FÄLLIGKEITEN EINSAMMELN — für eine Person (Seite, Kachel) oder für alle (wöchentlicher Push).
 *
 * Fällt eine Quelle aus (Datenbank gesperrt, Migration fehlt), fehlen nur ihre Zeilen, und `fehler`
 * sagt es. Ohne diesen Zweig risse ein kaputtes Modul die Startseite des Portals mit.
 *
 * Kein `"use client"` (Falle 6).
 */
import { sortiereFaelligkeiten, type Faelligkeit } from "@/core/faelligkeiten";
import { moduleUrl } from "@/core/shell/moduleUrl";
import { QUELLEN, type FaelligkeitsQuelle } from "./quellen";

export interface FaelligkeitsGruppe {
  modul: string;
  titel: string;
  /** `https://<host des Moduls>` oder `null`, wenn das Modul keinen Host hat — dann ohne Link. */
  basisUrl: string | null;
  /** Sortiert: überfällig zuerst, dann nach Frist. */
  eintraege: Faelligkeit[];
  /** `true`: die Quelle war nicht lesbar, `eintraege` ist leer und sagt nichts. */
  fehler: boolean;
}

export interface Zaehlung {
  ueberfaellig: number;
  bald: number;
}

/** Die Quellen, die diese Person sehen darf — leer heißt: weder Seite noch Kachel noch Menüeintrag. */
export function sichtbareQuellen(
  groups: readonly string[] | null | undefined,
  quellen: readonly FaelligkeitsQuelle[] = QUELLEN,
): FaelligkeitsQuelle[] {
  return quellen.filter((q) => q.darfSehen(groups));
}

export function sammle(
  quellen: readonly FaelligkeitsQuelle[],
  jetzt: Date,
  basis: (modul: string) => string | null = moduleUrl,
  melden: (meldung: string) => void = console.error,
): FaelligkeitsGruppe[] {
  return quellen.map((q) => {
    try {
      return { modul: q.modul, titel: q.titel, basisUrl: basis(q.modul), eintraege: sortiereFaelligkeiten(q.lesen(jetzt)), fehler: false };
    } catch (fehler) {
      melden(`Was steht an: ${q.titel} nicht lesbar — ${fehler instanceof Error ? fehler.message : String(fehler)}`);
      return { modul: q.modul, titel: q.titel, basisUrl: basis(q.modul), eintraege: [], fehler: true };
    }
  });
}

export function zaehle(gruppen: readonly FaelligkeitsGruppe[]): Zaehlung {
  let ueberfaellig = 0;
  let bald = 0;
  for (const g of gruppen) {
    for (const e of g.eintraege) {
      if (e.dringlichkeit === "ueberfaellig") ueberfaellig += 1;
      else bald += 1;
    }
  }
  return { ueberfaellig, bald };
}
