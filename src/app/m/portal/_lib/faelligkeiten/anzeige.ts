/**
 * Sortierung und Ortsangabe für „Was steht an" — nur das Portal braucht sie, deshalb hier und nicht
 * neben dem Typ in `core/faelligkeiten.ts`. Kein `"use client"` (Falle 6).
 */
import type { Faelligkeit } from "@/core/faelligkeiten";

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
