/** Die drei Stammdatenarten der Verwaltung (Spec §5.1); Grundlage für Reiter, CSV-Import und Routen. */
export type Stammdatenart = "fahrzeuge" | "personal" | "stichworte";
export const STAMMDATENARTEN: readonly Stammdatenart[] = ["fahrzeuge", "personal", "stichworte"];

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
export interface StichwortDTO {
  id: string;
  gruppe: string;
  name: string;
  reihenfolge: number;
  aktiv: boolean;
}
