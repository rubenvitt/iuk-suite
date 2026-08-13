import type { SuiteNavItem } from "@/core/shell/types";

/**
 * DIE FORM FOLGT DEN DATEN, NICHT EINEM SCHWELLENWERT.
 *
 * KEIN `"use client"`: `SuiteHeader` und `FullShell` sind Server Components und
 * lesen `hatAbschnitte`. Ein `"use client"` hier ergäbe dort eine
 * Client-Referenz statt der Funktion — HTTP 500, das kein Gate sieht
 * (`docs/design/README.md`, Falle 6).
 *
 * Warum kein Schwellenwert auf der Anzahl („ab zehn Einträgen eine Leiste"):
 * das wäre eine Zahl, die niemand begründen kann und die bei elf anders
 * aussieht als bei zehn. Und warum kein zusätzliches Prop am `Shell`: das
 * erlaubte zwei Modulen, sich bei gleicher Datenlage verschieden zu verhalten.
 */
export interface NavAbschnitt {
  /** `null` = die Einträge VOR der ersten Überschrift. */
  titel: string | null;
  items: SuiteNavItem[];
}

export function hatAbschnitte(nav: SuiteNavItem[]): boolean {
  return nav.some((e) => (e.abschnitt?.trim() ?? "") !== "");
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
