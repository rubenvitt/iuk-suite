/**
 * DIE FAHRZEUGAKTE (IDA-299) — was Datenbank, Fristrechnung, Seiten und Server Actions untereinander
 * austauschen. Serialisierbar, damit es über die RSC-Grenze in die Client-Inseln geht (Falle 9). Kein
 * `"use client"` (Falle 6).
 *
 * Kalendertage sind `JJJJ-MM-TT` in der Suite-Zone (`heute.ts`), nie ein `Date`. Längen in Zentimetern,
 * Gewichte in Kilogramm, beides ganzzahlig — die Oberfläche zeigt Meter mit zwei Nachkommastellen.
 * `null` heißt überall „nicht erfasst“.
 */
import type { FahrzeugDTO } from "../daten";

/** `offen` = nicht erfasst (es fehlt die letzte Prüfung); zählt weder als fällig noch als in Ordnung. */
export type Stufe = "ueberfaellig" | "bald" | "ok" | "offen";

/** Rangfolge, schlimmste zuerst: Sortierung der Tafel und „Gesamt“ eines Fahrzeugs laufen darüber. */
export const STUFEN: readonly Stufe[] = ["ueberfaellig", "bald", "offen", "ok"];

export const STUFE_WORT: Record<Stufe, string> = {
  ueberfaellig: "überfällig",
  bald: "bald",
  ok: "in Ordnung",
  offen: "nicht erfasst",
};

/** Die drei festen Spalten der Tafel und alles Übrige („Feuerlöscher“, „Ladebordwand“ …). */
export const PRUEF_ARTEN = ["HU", "UVV", "Service", "Weitere"] as const;
export type PruefArt = (typeof PRUEF_ARTEN)[number];

export const REIFEN_ARTEN = ["Winter", "Sommer", "Ganzjahres"] as const;
export type ReifenArt = (typeof REIFEN_ARTEN)[number];

export const FUEHRERSCHEINE = ["B", "BE", "C1", "C1E", "C", "CE"] as const;
export type Fuehrerschein = (typeof FUEHRERSCHEINE)[number];

/** Vorschläge im Feld „Besonderheiten“; eigene Einträge sind erlaubt. „Tempo 100“ ändert die Reifenregel. */
export const BESONDERHEITEN = [
  "Sondersignal", "Anhängerkupplung", "Allrad", "Ladebordwand", "Stromerzeuger", "Standheizung",
  "Rückfahrkamera", "Landstrom", "Tempo 100", "Auflaufbremse",
] as const;
export const TEMPO_100 = "Tempo 100";

export interface TechnikDTO {
  modell: string | null;
  baujahr: number | null;
  laengeCm: number | null;
  breiteCm: number | null;
  hoeheCm: number | null;
  zggKg: number | null;
  leerKg: number | null;
  /** Führer / Unterführer / Mannschaft. `null` bei Anhängern und solange nicht erfasst. */
  staerke: [number, number, number] | null;
  sitze: number | null;
  tragen: number | null;
  fuehrerschein: Fuehrerschein | null;
  besonderheiten: string[];
}

export interface PruefungDTO {
  id: string;
  art: PruefArt;
  /** „HU (TÜV)“, „Inspektion“, „Feuerlöscher“. */
  name: string;
  /** Abstand in Monaten. */
  monate: number;
  /** Zusätzlich nach Kilometern (Service): fällig, was zuerst erreicht ist. */
  kmAbstand: number | null;
  zuletzt: string | null;
  /** Kilometerstand bei der letzten Erledigung; nur mit `kmAbstand` von Belang. */
  zuletztKm: number | null;
  /** Von Hand gesetzter nächster Termin; schlägt „zuletzt + Abstand“. */
  vonHand: string | null;
  bemerkung: string;
}

export interface ReifensatzDTO {
  id: string;
  art: ReifenArt;
  /** Herstellwoche und -jahr, vier Ziffern `WWJJ` („3822“ = Woche 38 im Jahr 2022). */
  dot: string;
  /** Wo der Satz liegt, solange er nicht aufgezogen ist. Leer = nicht erfasst. */
  lager: string;
}

export interface AkteDTO {
  fahrzeug: FahrzeugDTO;
  technik: TechnikDTO;
  /** Kilometerstand laut Tacho; `null` bei Anhängern und solange nicht abgelesen. */
  km: number | null;
  kmAm: string | null;
  /** Welcher Satz gerade drauf ist; `null`, solange kein Satz erfasst ist. */
  aufgezogen: ReifenArt | null;
  reifensaetze: ReifensatzDTO[];
  /** In fester Reihenfolge: HU, UVV, Service, dann Weitere nach Namen. */
  pruefungen: PruefungDTO[];
}

/* ---------- Was die Fristrechnung (`regeln.ts`) herausgibt ---------- */

export interface PruefStand {
  pruefung: PruefungDTO;
  stufe: Stufe;
  /** „seit 7 Tagen fällig“, „in 12 Tagen“, „heute fällig“, „noch 800 km“, „bis 03/2027“, „nicht erfasst“. */
  text: string;
  faelligAm: string | null;
  /** Kilometerstand, bei dem die Prüfung fällig wird; `null` ohne `kmAbstand` oder ohne `zuletztKm`. */
  kmGrenze: number | null;
  /** Kilometer bis zur Grenze, negativ = darüber. */
  kmRest: number | null;
}

export interface ReifenTeil {
  stufe: Stufe;
  /** Ganzer Satz für die Akte: „Winterreifen fällig seit 01.10.2026“, „7 Jahre alt, Ersatz einplanen“. */
  text: string;
  /** Kurzform für die Tafel: „Winterreifen fällig“, „7 Jahre alt“, „Winter drauf“. */
  kurz: string;
}

export interface ReifenStand {
  /** Der aufgezogene Satz. */
  satz: ReifensatzDTO;
  /** Volle Jahre seit der DOT-Woche. */
  alterJahre: number;
  alter: ReifenTeil;
  saison: ReifenTeil;
  /** Die schlimmere der beiden Stufen. */
  stufe: Stufe;
}

export interface Auswertung {
  pruefungen: PruefStand[];
  /** `null`, solange kein aufgezogener Satz erfasst ist. */
  reifen: ReifenStand | null;
  /** Gesamtstufe des Fahrzeugs: die schlimmste aus Prüfungen und Reifen (nach `STUFEN`). */
  stufe: Stufe;
  /** Die Prüfung mit dem frühesten `faelligAm`. */
  naechster: PruefStand | null;
}

/** Was die Seiten an ihre Client-Inseln reichen: eine Akte samt gerechnetem Stand. */
export interface AkteMitStand {
  akte: AkteDTO;
  stand: Auswertung;
}

/* ---------- Eingaben der Server Actions (`_actions/akte.ts`), geprüft in `eingabe.ts` ---------- */

export type TechnikEingabe = TechnikDTO;

export interface KilometerEingabe {
  km: number;
  /** Ablesetag; fehlt er, gilt heute. Nie in der Zukunft. */
  am?: string;
}

export interface PruefungEingabe {
  art: PruefArt;
  name: string;
  monate: number;
  kmAbstand: number | null;
  zuletzt: string | null;
  vonHand: string | null;
}

export interface ErledigtEingabe {
  /** Tag der Prüfung, nie in der Zukunft. */
  am: string;
  /** Kilometerstand bei der Prüfung; Pflicht, wenn die Prüfung einen `kmAbstand` hat und das Fahrzeug Kilometer führt. */
  km: number | null;
  /** Nächsten Termin von Hand setzen; `null` = rechnen lassen (löscht einen alten Handtermin). */
  vonHand: string | null;
  bemerkung: string;
}

export interface ReifensatzEingabe {
  art: ReifenArt;
  dot: string;
  lager: string;
}

export interface ReifenwechselEingabe {
  /** Die Art des Satzes, der jetzt drauf ist; es muss einen Satz dieser Art geben. */
  aufgezogen: ReifenArt;
}
