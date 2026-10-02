import type { SymbolSpec } from "@einsatzzeichen/schema";

/**
 * Ein eigenes Zeichen, wie Bibliothek und Baukasten es sehen — rein, nur Typen (Server, Client-Inseln, Tests).
 * `nutzung`: in wie vielen Plänen (auch archivierten und Vorlagen) der Schlüssel steht; Löschen fragt damit nach.
 */
export interface EigenesZeichen {
  id: string;
  schluessel: string;
  titel: string;
  spec: SymbolSpec;
  beschreibung: string;
  nutzung: number;
}

/** Höchstzahl eigener Zeichen: eine Organisation braucht Dutzende, nicht Tausende — und jedes wird beim Abruf gezeichnet. */
export const EIGENE_ZEICHEN_MAX = 300;
/** Titel im Index und in der Suche; kürzer als ein Stellentitel, er steht unter einer Vorschau. */
export const EIGENER_TITEL_MAX = 80;
