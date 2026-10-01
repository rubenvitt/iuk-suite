import { z } from "zod";

/**
 * TOKEN-LINKS — die reinen Regeln (Spec §8.2; Umsetzungsplan Phase 5, Entscheidungen 2, 3, 10). Keine Uhr:
 * „jetzt" kommt als Argument. Server (Ausstellen, Auflösen, Druck) und Flyin teilen diese Datei.
 */
export const FREIGABE_DAUERN = ["24h", "7d", "30d", "unbegrenzt"] as const;
export type FreigabeDauer = (typeof FREIGABE_DAUERN)[number];
export const DAUER_VORGABE: FreigabeDauer = "7d";
export const DAUER_NAME: Record<FreigabeDauer, string> = { "24h": "24 Stunden", "7d": "7 Tage", "30d": "30 Tage", unbegrenzt: "Unbegrenzt" };
const STUNDE = 3_600_000;
const DAUER_MS: Record<FreigabeDauer, number | null> = { "24h": 24 * STUNDE, "7d": 7 * 24 * STUNDE, "30d": 30 * 24 * STUNDE, unbegrenzt: null };

/** Notiz und Menge — die Datenbank braucht beides nicht, die Bedienung schon (Entscheidung 1). */
export const FREIGABE_GRENZE = { notiz: 200, gueltigJePlan: 20 } as const;

/** 32 Byte als base64url ohne Auffüllung: genau 43 Zeichen. Geprüft VOR jeder Datenbankabfrage (Entscheidung 2). */
export const TOKEN_MUSTER = /^[A-Za-z0-9_-]{43}$/;
export const istTokenForm = (t: string): boolean => TOKEN_MUSTER.test(t);

/** Dauer ab jetzt, kein Kalendertag: ein am Abend ausgestellter 24-h-Link gilt bis zum nächsten Abend. */
export function ablaufFuer(dauer: FreigabeDauer, jetzt: number): number | null {
  const d = DAUER_MS[dauer];
  return d === null ? null : jetzt + d;
}

export type FreigabeStatus = "gueltig" | "abgelaufen" | "widerrufen";
interface Zustand { ablauf: number | null; widerrufenAm: number | null }
/** Genau an der Grenze ist ein Link schon abgelaufen. Widerrufen schlägt abgelaufen (die stärkere Aussage). */
export function freigabeStatus(f: Zustand, jetzt: number): FreigabeStatus {
  if (f.widerrufenAm !== null) return "widerrufen";
  if (f.ablauf !== null && f.ablauf <= jetzt) return "abgelaufen";
  return "gueltig";
}

/** Eine Zeile, wie das Flyin sie bekommt — nur für Bearbeitende (sie trägt den Token). */
export interface FreigabeZeile {
  id: string; token: string; notiz: string | null; ablauf: number | null; widerrufenAm: number | null;
  erstelltAm: number; erstelltVon: string; zuletztAbgerufen: number | null; abrufe: number; status: FreigabeStatus;
}

/**
 * Der Link für den QR auf dem INTERNEN Ausdruck (Entscheidung 10): unbegrenzt vor spätestem Ablauf, bei Gleichstand
 * der zuletzt ausgestellte. Der Token-Druck nimmt nie diesen, sondern den benutzten (Entscheidung 9).
 */
export function waehleQrFreigabe<T extends Zustand & { token: string; erstelltAm: number }>(zeilen: readonly T[], jetzt: number): T | null {
  return besteFreigabe(zeilen.filter((z) => freigabeStatus(z, jetzt) === "gueltig"));
}

/** Dieselbe Rangfolge ohne Uhr: der Aufrufer reicht nur gültige Zeilen (der Editor nimmt den Status vom Server). */
export function besteFreigabe<T extends { erstelltAm: number; ablauf: number | null }>(zeilen: readonly T[]): T | null {
  const rang = (z: T) => z.ablauf ?? Number.POSITIVE_INFINITY;
  let best: T | null = null;
  for (const z of zeilen) {
    if (best === null || rang(z) > rang(best) || (rang(z) === rang(best) && z.erstelltAm > best.erstelltAm)) best = z;
  }
  return best;
}

export const tokenPfad = (token: string): string => `/t/${token}`;
/** Die Basis kommt aus `moduleUrl("kommplan")`, nie aus dem Request-Host (Entscheidung 10). */
export const tokenUrl = (basis: string, token: string): string => `${basis.replace(/\/+$/, "")}${tokenPfad(token)}`;

const ID = z.string().min(1).max(64);
export const ausstellenSchema = z.object({
  planId: ID,
  dauer: z.enum(FREIGABE_DAUERN),
  notiz: z.string().max(FREIGABE_GRENZE.notiz, `Höchstens ${FREIGABE_GRENZE.notiz} Zeichen.`).transform((s) => s.trim()),
}).strict();
export const widerrufenSchema = z.object({ planId: ID, freigabeId: ID }).strict();
