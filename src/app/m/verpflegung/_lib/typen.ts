/**
 * Was die Seiten des Verpflegungslagers herausgeben — serialisierbar, damit es über die RSC-Grenze in die
 * Client-Inseln geht (Falle 9). Kein `"use client"` (Falle 6).
 */
import type { MhdArt, MhdStatus } from "./mhd";

export interface OrtDTO {
  id: string;
  name: string;
  kurz: string;
  gekuehlt: boolean;
  aktiv: boolean;
}

export interface ArtikelDTO {
  id: string;
  name: string;
  ean: string | null;
  kategorie: string;
  einheit: string;
  mhdArt: MhdArt;
  rotTage: number;
  gelbTage: number;
  mindest: number | null;
  vorlaeufig: boolean;
  aktiv: boolean;
}

export interface ChargeDTO {
  id: string;
  artikelId: string;
  ortId: string;
  mhd: string;
  menge: number;
  eingang: string;
  status: MhdStatus;
}

export type BuchungsArt = "eingang" | "ausgabe" | "aussonderung";
export const BUCHUNGS_TEXT: Record<BuchungsArt, string> = { eingang: "Eingang", ausgabe: "Ausgabe", aussonderung: "Aussonderung" };

export interface BuchungDTO {
  id: string;
  zeit: number;
  art: BuchungsArt;
  artikelId: string;
  artikelName: string;
  einheit: string;
  ortKurz: string;
  mhd: string;
  menge: number;
  wer: string;
  grund: string | null;
  ziel: string | null;
}

export interface LinkDTO {
  id: string;
  name: string;
  code: string;
  gueltigBis: number;
  aktiv: boolean;
  angelegtAm: number;
  angelegtVon: string;
  zuletztAm: number | null;
}

/** Ein Link in der Liste der Verwaltung; Adresse und QR nur, solange er gilt (`_lib/links.ts`). */
export interface LinkZeile extends LinkDTO {
  stand: "aktiv" | "abgelaufen" | "gesperrt";
  adresse: string | null;
  qr: string | null;
}

/** Was ein Nachschlagen in der Lebensmitteldatenbank liefert (`_lib/lebensmittel.ts`). */
export interface Fund {
  name: string;
  kategorie: string | null;
  einheit: string | null;
}

export type Ergebnis =
  | { ok: true; id?: string; text?: string }
  | { ok: false; fehler: string; feldFehler?: Record<string, string> };

/** Eine Charge mit dem, was eine Liste über Ware und Ort braucht. */
export interface ChargeSicht extends ChargeDTO {
  artikelName: string;
  einheit: string;
  mhdArt: MhdArt;
  kategorie: string;
  ortName: string;
  ortKurz: string;
}
