/**
 * Immutables Umschalten eines Werts in einer Menge (fuer Mehrfach-Filter).
 *
 * Zeichengleich aus `lagerbuch/src/components/Filterleiste.tsx:15-20`
 * uebernommen, nur der Ablageort wechselt: sie ist KEIN Bedienelement und hat
 * mit der Filterleiste nur den Ablageort gemeinsam (§6.9.4, Punkt 4).
 *
 * IMMUTABEL IST DIE GANZE ZUSICHERUNG. `set.add(x)` auf der uebergebenen Menge
 * aenderte die Referenz nicht, React renderte nicht neu, und der Filterchip
 * saehe unveraendert aus — ein Klick, der nichts tut, ohne Fehler und ohne
 * Meldung. `mengen.test.ts` haelt es fest.
 *
 * KEIN "use client": die Datei liegt unter `_lib/` und wird von Client-Inseln
 * importiert. Ein Client-Modul waere hier harmlos, aber die Regel „kein
 * \"use client\" unter `_lib/`" ist absichtlich ausnahmslos — sonst muss bei
 * jeder Datei einzeln entschieden werden, ob eine Server Component sie je
 * anfassen wird.
 */
export function toggleInSet<T>(set: ReadonlySet<T>, item: T): Set<T> {
  const naechste = new Set(set);
  if (naechste.has(item)) naechste.delete(item);
  else naechste.add(item);
  return naechste;
}
