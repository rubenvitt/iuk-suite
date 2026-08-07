/**
 * Der Vertrag zwischen Loeschdialog und Loesch-Action.
 *
 * Diese Datei bleibt absichtlich ohne "use client" und "use server": Die
 * Server Actions lesen die Typen, waehrend ein exportierter Typ in einer
 * "use server"-Datei erst zur Laufzeit auffallen wuerde.
 *
 * Vorlagen fehlen absichtlich. Sie werden ueber `deleteTemplate` geloescht
 * und haben weder eine Zaehler-Logik noch eine Revalidate-Zeile in der
 * generischen Loesch-Action. Deshalb bekommt der Dialog seine Actions als
 * Props, statt diesen Sonderfall in `ElementArt` aufzunehmen.
 */
export const ELEMENT_ARTEN = [
  "artikel",
  "fahrzeug",
  "token",
  "bzGeraet",
  "o2Flasche",
  "geraet",
] as const;

export type ElementArt = (typeof ELEMENT_ARTEN)[number];

/** Ergebnis der serverseitigen Vorpruefung. */
export type Loeschbarkeit =
  | { loeschbar: true }
  | { loeschbar: false; grund: string; kannDeaktivieren: boolean };
