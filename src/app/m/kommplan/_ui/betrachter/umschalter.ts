import type { KarteL } from "../../_lib/layout/typen";

/**
 * Der Einklapp-Umschalter einer Karte im Betrachter (Spec §5.7), relativ zur Karte.
 *
 * UNTEN RECHTS AUF DER ECKE, klein: Text endet 1,5 mm vor der rechten Kante (`KARTE.innenRechts`),
 * Stiele und Gasse liegen links oder mittig, Einheiten und Kanäle beginnen 2,5 mm unter der Karte,
 * das Abzeichen steht mittig darunter. Die frühere Lage mitten auf der Unterkante deckte die letzte
 * Kontaktzeile (meist die E-Mail) und das Abzeichen „+n Stellen" zu (Review Phase 1). Der Griff
 * ist unsichtbar größer als der Kreis, damit er sich auch mit dem Finger trifft; er verdeckt nichts.
 * `umschalter.test.ts` prüft die Lage gegen alle Texte, Kästen und Linien.
 */
export const UMSCHALTER = { r: 1.4, griff: 2.6, schrift: 2.4 } as const;

export function umschalterLage(k: Pick<KarteL, "breite" | "hoehe">): { cx: number; cy: number; r: number } {
  return { cx: k.breite, cy: k.hoehe, r: UMSCHALTER.r };
}
