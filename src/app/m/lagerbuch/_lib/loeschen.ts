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
/**
 * ⚠️ `lagerort` HIESS BIS DRK-349 `fahrzeug` UND MEINTE SCHON IMMER JEDEN ORT.
 * Der alte Name war die Ursache eines stillen Fehlschlags: die Pruefung kannte
 * keinen Typriegel, das Loeschen daneben schon (`WHERE typ = 'fahrzeug'`) — ein
 * Schrank kam also durch die Pruefung und wurde nicht geloescht, und die Aktion
 * meldete Erfolg. Der ehrliche Name ist hier kein Geschmack, sondern der Fix:
 * `lagerort` heisst Handlager, Fahrzeug UND Schrank, und die Pruefung ist damit
 * das einzige Tor.
 *
 * ⚠️ NICHT ZU VERWECHSELN MIT `lagerorte.typ` UND `tokens.zielTyp` — beide
 * tragen weiterhin den Wert `"fahrzeug"`, beide sind gespeicherte Spaltenwerte
 * und meinen wirklich nur Fahrzeuge. Seit der Umbenennung ist `"fahrzeug"` im
 * Modul eindeutig: es ist nie mehr eine Element-Art.
 */
export const ELEMENT_ARTEN = [
  "artikel",
  "lagerort",
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
