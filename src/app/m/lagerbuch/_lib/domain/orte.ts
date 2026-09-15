/**
 * DRK-297 — der Begriff „Handlager" an genau EINER Stelle.
 *
 * Kein "use client", kein Icon-Import, kein Datenbankzugriff. Reine Funktion
 * ueber bereits geladene Zeilen — dieselbe Bauart wie `_lib/domain/bestand.ts`.
 *
 * ⚠️ DIE WURZEL IST IMMER TEIL DES ERGEBNISSES, auch wenn es sie gar nicht
 * gibt. Der Grund ist nicht Hoeflichkeit: das Ergebnis geht in `inArray`, und
 * drizzle macht aus einer leeren Liste `WHERE false` — jeder Bestand fiele
 * still auf 0, ohne dass irgendwo etwas wirft.
 */
export type OrtZeile = { id: string; parentId: string | null; sortierung: number };

/**
 * Die Wurzel und ihre direkten Kinder, Wurzel zuerst, Kinder nach
 * `sortierung`, dann `id`.
 *
 * ⚠️ EINE EBENE TIEF, UND DAS IST EINE ENTSCHEIDUNG: Schraenke haben heute
 * keine Kinder, die Faecher darin sind `artikel.fach`. Die Schleife unten
 * steigt trotzdem beliebig tief — nicht aus Vorrat, sondern damit ein spaeter
 * eingehaengter Ort nicht still aus dem Bestand faellt.
 *
 * ⚠️ DIE REIHENFOLGE IST FACHLICH: sie ist der vierte Sortierrang von FEFO
 * (`domain/fefo.ts`). Eine „egale" Reihenfolge schickte jemanden ohne Not zum
 * GF-Schrank.
 */
export function teilbaum(orte: OrtZeile[], wurzelId: string): string[] {
  const kinder = new Map<string, OrtZeile[]>();
  for (const o of orte) {
    if (o.parentId === null) continue;
    const gruppe = kinder.get(o.parentId);
    if (gruppe) gruppe.push(o);
    else kinder.set(o.parentId, [o]);
  }

  const ergebnis: string[] = [];
  const gesehen = new Set<string>();
  const absteigen = (id: string): void => {
    // Der Riegel gegen den Zyklus. Ein Schrank ist heute nie Elternteil; wenn
    // es doch einmal so kommt, ist eine Endlosschleife der teuerste Ausgang.
    if (gesehen.has(id)) return;
    gesehen.add(id);
    ergebnis.push(id);
    const gruppe = kinder.get(id) ?? [];
    for (const kind of [...gruppe].sort((a, b) => a.sortierung - b.sortierung || a.id.localeCompare(b.id))) {
      absteigen(kind.id);
    }
  };
  absteigen(wurzelId);
  return ergebnis;
}
