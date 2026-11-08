/**
 * Was die Seiten der Gerätewartung herausgeben — serialisierbar, damit es über die RSC-Grenze in die
 * Client-Inseln geht (Falle 9). Kein `"use client"` (Falle 6).
 */
import type { FristStand, Wer, Zustand } from "./fristen";
import type { PlanPunkt, PruefartZeile } from "./pruefplan";

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

/** Eine Prüfart des Katalogs (IDA-368) mit den Gerätearten, die sie von sich aus haben, und den Geräten, an denen sie gilt. */
export interface PruefartDTO extends PruefartZeile {
  arten: string[];
  geraete: number;
}

export interface CheckpunktDTO {
  id: string;
  text: string;
  hinweis: string;
  /** Nur beim Durchzählen einer Materialkiste: die Soll-Menge der Position. */
  soll?: number;
  /** Zu welchen Prüfarten der Punkt gehört (IDA-369); leer heißt zu allen. */
  pruefarten?: string[];
}

/** Eine Position der Inhaltsliste einer Materialkiste (IDA-335). */
export interface InhaltDTO {
  id: string;
  text: string;
  soll: number;
  bemerkung: string;
}

export interface ArtDTO {
  id: string;
  name: string;
  einzahl: string;
  ikone: string;
  stundenPflicht: boolean;
  kiste: boolean;
  /** Die Prüfarten, die jedes Gerät dieser Art von sich aus hat, in der Reihenfolge des Katalogs. */
  pruefarten: string[];
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
  /** Materialkiste mit Inhaltsliste (IDA-335). */
  kiste: boolean;
  ortArt: "lager" | "fahrzeug";
  ort: string;
  fahrzeugId: string | null;
  stunden: number | null;
  /** Freitext für den Steckbrief am QR-Code (IDA-300). */
  hinweise: string;
  /** Wie man das Gerät bzw. die Kiste durchgeht (IDA-372). */
  pruefanleitung: string;
  aktiv: boolean;
  zustand: Zustand;
  /** Die Prüfarten der Art und die zusätzlichen, mit dem, was am Gerät gilt (IDA-368). */
  plan: PlanPunkt[];
  staende: FristStand[];
  naechste: FristStand | null;
  offeneMaengel: number;
  /** Davon beim Durchzählen als fehlend gemeldet. */
  fehlend: number;
  /** Es ist gerade etwas aus der Kiste unterwegs (IDA-372). */
  unterwegs: boolean;
  /** Zuletzt als eingesetzt vermerkt, noch nicht zurück (IDA-369). */
  imEinsatz: boolean;
}

/** Eine Entnahme für die Akte; `zurueckAm` null heißt: noch unterwegs. */
export interface EntnahmeDTO {
  id: string;
  wer: string;
  zweck: string;
  ganz: boolean;
  seit: number;
  zurueckAm: number | null;
  zurueckWer: string | null;
  positionen: string[];
}

export interface EintragDTO {
  id: string;
  geraetId: string;
  geraetName: string;
  typ: "pruefung" | "erledigt" | "stunden" | "mangel" | "behoben" | "einsatz" | "rueckkehr";
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

export type { PlanPunkt, Wer, Zustand };

/** Ergebnis einer Server Action, mit Fehlern am Feld. */
/** `weiter`: nach dem Zurücklegen die Prüfart „nach Benutzung“, die jetzt fällig ist (das Telefon geht dorthin). */
export type Ergebnis = { ok: true; id?: string; weiter?: string } | { ok: false; fehler: string; feldFehler?: Record<string, string> };

/** Orte, die schon vorkommen, je Art — Vorschläge im Gerät-Formular. */
export interface BekannteOrte {
  lager: string[];
  fahrzeug: string[];
}
