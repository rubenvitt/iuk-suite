import type { SuiteNavItem } from "@/core/shell/types";

/**
 * DIE GRUPPIERUNG INNERHALB DER LEISTE — nicht mehr die Bauform.
 *
 * Hier stand bis 2026-08-13 zusaetzlich `hatAbschnitte`, und daraus leiteten
 * `SuiteHeader` und `FullShell` ZWEI Bauformen ab: mit `abschnitt` eine
 * Seitenleiste, ohne eine zweite Kopfzeile. Das war in sich schluessig und
 * trotzdem der Fehler — ein optionales Feld entschied, ob dasselbe Produkt
 * links oder oben navigiert. Seither bekommt jedes Modul mit Navigation die
 * Leiste, und diese Datei beantwortet nur noch, wie ihre Eintraege darin
 * gruppiert sind.
 *
 * KEIN `"use client"`: `Modulleiste` ist zwar eine Client-Komponente, aber der
 * Typ `SuiteNavItem` wird auch von Server Components gelesen. Ein `"use
 * client"` hier ergaebe dort eine Client-Referenz statt der Funktion — HTTP
 * 500, das kein Gate sieht (`docs/design/README.md`, Falle 6).
 */
export interface NavAbschnitt {
  /** `null` = die Einträge VOR der ersten Überschrift. */
  titel: string | null;
  items: SuiteNavItem[];
}

/**
 * Reihenfolge der Abschnitte = Reihenfolge ihres ersten Auftretens. Eine
 * alphabetische Sortierung wäre eine zweite, unsichtbare Entscheidung über
 * etwas, das der Aufrufer schon getroffen hat.
 */
export function gruppiereNav(nav: SuiteNavItem[]): NavAbschnitt[] {
  const gruppen: NavAbschnitt[] = [];
  const nachTitel = new Map<string | null, NavAbschnitt>();

  for (const eintrag of nav) {
    const titel = eintrag.abschnitt?.trim() ? eintrag.abschnitt : null;
    const vorhanden = nachTitel.get(titel);
    if (vorhanden) {
      vorhanden.items.push(eintrag);
      continue;
    }
    const gruppe: NavAbschnitt = { titel, items: [eintrag] };
    nachTitel.set(titel, gruppe);
    gruppen.push(gruppe);
  }

  // Die titellose Gruppe nach vorn — sie steht vor jeder Überschrift, egal wo
  // ihre Einträge im Quell-Array lagen.
  return gruppen.sort((a, b) => (a.titel === null ? -1 : b.titel === null ? 1 : 0));
}
