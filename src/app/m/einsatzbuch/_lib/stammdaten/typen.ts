/** Die drei Stammdatenarten der Verwaltung (Spec §5.1); Grundlage für Reiter, CSV-Import und Routen. */
export type Stammdatenart = "fahrzeuge" | "personal" | "stichworte";
export const STAMMDATENARTEN: readonly Stammdatenart[] = ["fahrzeuge", "personal", "stichworte"];
/**
 * Die Reiter der Stammdatenseite: die drei Arten und die Qualifikationen des Personals (IDA-282).
 * Hier und nicht in der Client-Insel, weil `page.tsx` den Wert liest (Falle 6).
 */
export type Reiter = Stammdatenart | "qualifikationen";
export const REITER: readonly Reiter[] = [...STAMMDATENARTEN, "qualifikationen"];

export interface FahrzeugDTO {
  id: string;
  typ: string;
  kennung: string;
  ruf: string;
  standort: string;
  aktiv: boolean;
}
/**
 * `name` folgt der Form „Nachname, Vorname“ (Spec §5.1). Einen Ortsverein führt die Suite nicht
 * mehr (DRK-488: alle gehören zu Uelzen); im Draht und im Einsatzformat bleibt `ov` als leeres Feld.
 */
export interface PersonDTO {
  id: string;
  name: string;
  quali: string;
  aktiv: boolean;
}
/** Eine Qualifikation des Personals (IDA-282); `rang` 1 = höchste, am Personal steht `kurz`. */
export interface QualifikationDTO {
  id: string;
  kurz: string;
  lang: string;
  rang: number;
}
export interface StichwortDTO {
  id: string;
  gruppe: string;
  name: string;
  reihenfolge: number;
  aktiv: boolean;
}
