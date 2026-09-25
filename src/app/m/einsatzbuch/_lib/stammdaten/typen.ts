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
/** `name` folgt der Form „Nachname, Vorname“ (Spec §5.1). */
export interface PersonDTO {
  id: string;
  name: string;
  quali: string;
  ov: string;
  aktiv: boolean;
}
export interface StichwortDTO {
  id: string;
  gruppe: string;
  name: string;
  reihenfolge: number;
  aktiv: boolean;
}
