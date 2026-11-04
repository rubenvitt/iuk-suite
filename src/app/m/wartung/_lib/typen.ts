/**
 * Was die Seiten der Gerätewartung herausgeben — serialisierbar, damit es über die RSC-Grenze in die
 * Client-Inseln geht (Falle 9). Kein `"use client"` (Falle 6).
 */
import type { FristStand, FristVorlage, Wer, Zustand } from "./fristen";

export interface GruppeDTO {
  id: string;
  name: string;
  /** Wer die Gruppe verwaltet (IDA-337), nach Namen. */
  verwalter: VerwalterDTO[];
  geraete: number;
}

export interface VerwalterDTO {
  /** OIDC-`sub`. */
  nutzer: string;
  name: string;
}

export interface PersonVorschlag {
  nutzer: string;
  name: string;
  email: string | null;
}

export interface FristDTO extends FristVorlage {
  position: number;
}

export interface CheckpunktDTO {
  id: string;
  text: string;
  hinweis: string;
}

export interface ArtDTO {
  id: string;
  name: string;
  einzahl: string;
  ikone: string;
  stundenPflicht: boolean;
  fristen: FristDTO[];
  checkliste: CheckpunktDTO[];
  geraete: number;
}

export interface GeraetZeile {
  id: string;
  name: string;
  hersteller: string;
  typ: string;
  seriennr: string;
  gruppeId: string;
  gruppeName: string;
  artId: string;
  artEinzahl: string;
  ikone: string;
  stundenPflicht: boolean;
  ortArt: "lager" | "fahrzeug";
  ort: string;
  fahrzeugId: string | null;
  stunden: number | null;
  /** Freitext für den Steckbrief am QR-Code (IDA-300). */
  hinweise: string;
  aktiv: boolean;
  zustand: Zustand;
  staende: FristStand[];
  naechste: FristStand | null;
  offeneMaengel: number;
}

export interface EintragDTO {
  id: string;
  geraetId: string;
  geraetName: string;
  typ: "pruefung" | "erledigt" | "stunden" | "mangel" | "behoben";
  titel: string;
  am: string;
  stunden: number | null;
  wer: string;
  notiz: string;
  ergebnis: Zustand | null;
  antworten: { text: string; ok: boolean }[] | null;
  maengel: number;
}

export interface MangelDTO {
  id: string;
  geraetId: string;
  geraetName: string;
  ort: string;
  gruppeName: string;
  text: string;
  foto: boolean;
  einsatzbereit: boolean;
  gemeldetAm: number;
  gemeldetVon: string;
  behobenAm: number | null;
  behobenVon: string | null;
}

/** Eine Unterlage am Gerät (IDA-300); die Datei liefert `g/[id]/unterlagen/[uid]` aus. */
export interface UnterlageDTO {
  id: string;
  titel: string;
  typ: "pdf" | "bild";
  bytes: number;
}

export interface FristZeile {
  geraet: Pick<GeraetZeile, "id" | "name" | "ort" | "gruppeName">;
  frist: FristStand;
}

export type { Wer, Zustand };

/** Ergebnis einer Server Action, mit Fehlern am Feld. */
export type Ergebnis = { ok: true; id?: string } | { ok: false; fehler: string; feldFehler?: Record<string, string> };

/** Orte, die schon vorkommen, je Art — Vorschläge im Gerät-Formular. */
export interface BekannteOrte {
  lager: string[];
  fahrzeug: string[];
}
