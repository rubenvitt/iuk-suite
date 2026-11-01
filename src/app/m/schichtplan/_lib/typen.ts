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
/** Raster, auf das Aufziehen, Verschieben und die Eingabefelder einrasten. */
export const RASTER_MIN = 15;
export const SCHICHTLAENGEN_STD = [2, 3, 4, 6, 8, 12] as const;
