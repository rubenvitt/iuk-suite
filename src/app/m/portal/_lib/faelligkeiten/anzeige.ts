/**
 * Sortierung und Ortsangabe für „Was steht an" — nur das Portal braucht sie, deshalb hier und nicht
 * neben dem Typ in `core/faelligkeiten.ts`. Kein `"use client"` (Falle 6).
 */
import type { Dringlichkeit, Faelligkeit } from "@/core/faelligkeiten";
import type { FaelligkeitsGruppe } from "./sammeln";

/** Dringliches zuerst, dann nach `sortierung`, dann nach Titel. Arbeitet auf einer Kopie. */
export function sortiereFaelligkeiten(liste: readonly Faelligkeit[]): Faelligkeit[] {
  const rang = (f: Faelligkeit) => (f.dringlichkeit === "ueberfaellig" ? 0 : 1);
  return [...liste].sort((a, b) =>
    rang(a) - rang(b)
    || a.sortierung.localeCompare(b.sortierung)
    || a.titel.localeCompare(b.titel, "de"));
}

/**
 * Der Ort für die Anzeige — oder `null`, wenn er schon im Titel steht. Geräte und Flaschen tragen ihren
 * Standort oft im Namen („Accu-Chek Guide (KTW 1)"), und „(KTW 1) · KTW 1" liest sich wie ein Fehler.
 */
export function woAnzeige(f: Pick<Faelligkeit, "titel" | "wo">): string | null {
  return f.wo && !f.titel.includes(f.wo) ? f.wo : null;
}

/*
 * DIE FILTER AUF „WAS STEHT AN" (IDA-391). Der Zustand liegt in der Insel, die Liste wird hier abgeleitet
 * (Falle 15: nichts merken, was sich aus Zustand und Daten ergibt).
 */

/** Die Wörter der suiteweiten Wortliste (Abschnitt „Fristen"), klein wie ein Zustand. */
export const DRINGLICHKEIT_TEXT: Record<Dringlichkeit, string> = {
  ueberfaellig: "überfällig",
  bald: "bald fällig",
};

export const ALLE_FAELLIGKEITEN = "alle";

export interface FaelligkeitsFilter {
  modul: string;
  dringlichkeit: Dringlichkeit | typeof ALLE_FAELLIGKEITEN;
}

/**
 * Die sichtbaren Gruppen. Eine Gruppe, die erst durch den Dringlichkeitsfilter leer wird, fällt weg —
 * „Hier steht gerade nichts an" stimmte dort nicht. Eine ausgefallene Quelle bleibt stehen, sie sagt
 * über keine Dringlichkeit etwas.
 */
export function filtereGruppen(
  gruppen: readonly FaelligkeitsGruppe[],
  filter: FaelligkeitsFilter,
): FaelligkeitsGruppe[] {
  return gruppen
    .filter((g) => filter.modul === ALLE_FAELLIGKEITEN || g.modul === filter.modul)
    .flatMap((g) => {
      if (filter.dringlichkeit === ALLE_FAELLIGKEITEN || g.fehler) return [g];
      const eintraege = g.eintraege.filter((e) => e.dringlichkeit === filter.dringlichkeit);
      return eintraege.length > 0 ? [{ ...g, eintraege }] : [];
    });
}
