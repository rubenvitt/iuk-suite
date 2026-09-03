import type { SymbolSpec } from "@einsatzzeichen/schema";

/**
 * Die Feldreihenfolge des kanonischen Schluessels. HANDGESCHRIEBEN, und deshalb
 * von `kanon.test.ts` gegen die tatsaechlich in den Rezepten vorkommenden Felder
 * gehalten: ein neues SymbolSpec-Feld wuerde sonst still weggelassen, und zwei
 * verschiedene Zeichen bekaemen denselben Schluessel.
 *
 * ⚠️ Das ist ein REINER TYPIMPORT aus @einsatzzeichen/schema. Er verschwindet im
 * Build und zaehlt deshalb in `naht.test.ts` nicht als Katalog-Import.
 */
export const ORDNUNG = [
  "kind",
  "bodyVariant",
  "organization",
  "technicalFill",
  "strength",
  "technicalHeadMark",
  "administrativeLevel",
  "functionRole",
  "vehicleCategory",
  "capabilities",
  "bodyMarks",
  "designation",
  "labels",
] as const;

/**
 * DER TYPWAECHTER — die zweite Haelfte des Feldwaechters, und die wichtigere.
 *
 * `kanon.test.ts` und der Generator pruefen `ORDNUNG` gegen die Felder, die in den 232
 * Rezepten VORKOMMEN. Ein Feld, das eine kuenftige Paketversion einfuehrt, das aber noch
 * kein Rezept fuehrt, kommt dort still durch — waehrend der Baukasten es bereits setzen
 * kann. Dann fielen zwei verschiedene Zusammenstellungen auf denselben Schluessel, und
 * der Bewerter der Bauuebung winkte eine falsche Antwort durch.
 *
 * Diese Zusicherung fragt den TYP statt der Daten und macht damit `pnpm typecheck` zum
 * Waechter. Fehlt ein Feld in `ORDNUNG`, ist der Typ `never` und die Zuweisung in
 * `kanon.test.ts` schlaegt fehl — mit dem Namen des fehlenden Feldes in der Meldung.
 *
 * `[…] extends […]` mit den Tupelklammern ist Absicht: ohne sie verteilte sich der
 * bedingte Typ ueber `never` und die Zusicherung waere immer erfuellt.
 */
export type OrdnungDecktSymbolSpec = [
  Exclude<keyof SymbolSpec, (typeof ORDNUNG)[number]>,
] extends [never]
  ? true
  : never;

/**
 * Ein Wert der Spec als Zeichenkette — REKURSIV, und das ist keine Kuer.
 *
 * Mit `String(v)` auf einer Ebene wurde aus jedem verschachtelten Objekt der Text
 * `[object Object]`: gemessen an 20 der 232 Rezepte, etwa F.2.11
 * `labels={topLeft:BTKombi,topLeftMetrics:[object Object]}`. Zwei Zeichen, die sich
 * ALLEIN in ihren Beschriftungsmetriken unterscheiden, bekaemen denselben Schluessel —
 * genau der stille Datenverlust, gegen den `OrdnungDecktSymbolSpec` eine Ebene hoeher
 * antritt. Ein Array verschachtelter Werte kollabierte zusaetzlich ueber `join(",")`.
 *
 * Die vier Regeln gelten auf JEDER Ebene: undefined/null/"" weglassen · leere Arrays
 * und leer gewordene Objekte weglassen · Arrays sortieren · Objektschluessel
 * alphabetisch. `null` als Rueckgabe heisst „traegt nichts bei" — der Aufrufer laesst
 * das Feld dann ganz weg, statt einen leeren Wert zu schreiben.
 */
function serialisiere(wert: unknown): string | null {
  if (wert === undefined || wert === null || wert === "") return null;
  if (Array.isArray(wert)) {
    const teile = wert
      .map(serialisiere)
      .filter((t): t is string => t !== null)
      .sort();
    return teile.length === 0 ? null : `[${teile.join(",")}]`;
  }
  if (typeof wert === "object") {
    const zonen = Object.entries(wert as Record<string, unknown>)
      .map(([k, v]) => [k, serialisiere(v)] as const)
      .filter((e): e is readonly [string, string] => e[1] !== null)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`);
    return zonen.length === 0 ? null : `{${zonen.join(",")}}`;
  }
  return String(wert);
}

/**
 * Ein stabiler Schluessel fuer eine Zusammenstellung. Vier Regeln:
 * undefined/null/"" weglassen · leere Arrays weglassen · Arrays sortieren ·
 * Felder in fester Reihenfolge serialisieren, Objektschluessel alphabetisch.
 *
 * GEMESSEN kollisionsfrei ueber alle 232 Hauptrezepte.
 */
export function kanonischerSchluessel(spec: SymbolSpec): string {
  const teile: string[] = [];
  for (const feld of ORDNUNG) {
    const wert = serialisiere((spec as unknown as Record<string, unknown>)[feld]);
    if (wert === null) continue;
    teile.push(`${feld}=${wert}`);
  }
  return teile.join("|");
}
