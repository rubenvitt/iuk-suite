/**
 * Die Datenformen zwischen Server und Planungsseite. Reine Typen und Konstanten, kein `"use client"`
 * (Falle 6): Server Components und Server Actions lesen dieselbe Datei wie der Editor.
 */

/** Eine Qualifikation, wie das Helfer-Modul sie herausgibt: Kürzel als Schlüssel, Name zur Anzeige. */
export interface Quali { kurz: string; name: string }

/** „Mindestens `anzahl` Personen mit `quali` (oder höher)“ je Schicht. */
export interface Anforderung { quali: Quali; anzahl: number }

export type EinheitArt = "abschnitt" | "fahrzeug";
export type PlanungArt = "veranstaltung" | "lage";
export type HelferQuelle = "stamm" | "temp";

export interface EinheitDTO {
  id: string;
  art: EinheitArt;
  name: string;
  fahrzeugId: string | null;
  kenner: string | null;
  schichtMin: number;
  soll: number;
  anforderungen: Anforderung[];
  position: number;
}

export interface SchichtDTO { id: string; einheitId: string; von: number; bis: number }
export interface ZuordnungDTO { schichtId: string; quelle: HelferQuelle; helferId: string }

export interface TempHelferDTO {
  id: string;
  vorname: string;
  nachname: string;
  telefon: string;
  organisation: string;
  qualifikationen: Quali[];
}

export interface PlanungDTO {
  id: string;
  name: string;
  art: PlanungArt;
  ort: string;
  von: number;
  bis: number;
  maxDienstMin: number;
  minRuheMin: number;
  einheiten: EinheitDTO[];
  schichten: SchichtDTO[];
  zuordnungen: ZuordnungDTO[];
  temporaere: TempHelferDTO[];
}

/** Eine Person, die die Planungsseite einteilen kann — aus den Stammdaten oder temporär. */
export interface PlanHelfer {
  /** `stamm:<id>` oder `temp:<id>` — eindeutig über beide Quellen. */
  schluessel: string;
  quelle: HelferQuelle;
  id: string;
  vorname: string;
  nachname: string;
  qualifikationen: Quali[];
  demo: boolean;
  telefon?: string;
  organisation?: string;
  /** Kennung in HiOrg-Server (nur Stammhelfer aus HiOrg) — für das Austauschblatt an Lifeline Hub (IDA-365). */
  hiorgId?: string;
}

/** Ein Fahrzeug aus den Stammdaten, wie die Auswahl es braucht. */
export interface FahrzeugWahl { id: string; name: string; kenner: string | null }

export interface PlanungKurz {
  id: string;
  name: string;
  art: PlanungArt;
  ort: string;
  von: number;
  bis: number;
  einheiten: number;
  schichten: number;
  soll: number;
  ist: number;
  offen: number;
  konflikte: number;
}

export const schluessel = (quelle: HelferQuelle, id: string) => `${quelle}:${id}`;
export const MINUTE = 60_000;
export const STUNDE = 60 * MINUTE;
/** Raster, auf das Aufziehen, Verschieben und die Eingabefelder einrasten (Ruben, 01.11.2026: flexibler als Viertelstunden). */
export const RASTER_MIN = 5;
/** Kürzeste Schicht; im Sanitätsdienst gibt es auch sehr kurze Einsätze (Ruben, 01.11.2026: „ab 10 min“). */
export const MIN_SCHICHT_MIN = 10;
/**
 * Höchstzahl der Qualifikationsanforderungen je Einheit — so viele nimmt Lifeline Hub im Soll an
 * (IDA-373); mehr wären dort eine fehlerhafte Zeile.
 */
export const MAX_ANFORDERUNGEN = 10;
/**
 * Der Name einer Einheit ist im Austauschblatt der Posten (IDA-365). Zwei Einheiten, die hier gleich
 * sind, fielen in Lifeline Hub zu einem Posten zusammen — deshalb ohne Groß-/Kleinschreibung und
 * mehrfache Leerzeichen verglichen.
 */
export const postenSchluessel = (name: string) => name.trim().replace(/\s+/g, " ").toLocaleLowerCase("de");
