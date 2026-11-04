/**
 * DIE FACHLOGIK DES VERPFLEGUNGSLAGERS: tagesgenaues MHD als Kalendertag `JJJJ-MM-TT`, Ampel je Artikel, Ausgabe
 * nach Ablauf zuerst (FEFO). Vorbild sind `lagerbuch/_lib/domain/verfall.ts` (monatsgenau) und die FEFO-Reihenfolge
 * dort. Rein, ohne Datenbank, ohne `"use client"` (Falle 6) — Server- und Client-Seiten rechnen gleich.
 */

export type Ampel = "rot" | "gelb" | "ok";
export type MhdArt = "mhd" | "verbrauch";

export const EINHEITEN = ["Stück", "Dose", "Flasche", "Packung", "Becher", "Laib", "Karton", "kg", "l"] as const;
export type Einheit = (typeof EINHEITEN)[number];
/** Einheiten, in denen man Teile entnimmt (0,5 kg); sonst ganze Zahlen. */
export const TEILBAR: readonly string[] = ["kg", "l"];

export const KATEGORIEN = ["Getränke", "Konserven", "Trockenware", "Kühlware", "Backwaren", "Snacks", "Sonstiges"] as const;

export const AUSSONDER_GRUENDE = ["abgelaufen", "beschädigt", "Rückruf", "verdorben", "Sonstiges"] as const;
export type AussonderGrund = (typeof AUSSONDER_GRUENDE)[number];
export const AUSGABE_ZIELE = ["Einsatz", "Übung", "Dienstabend", "Sanitätsdienst", "Sonstiges"] as const;

export const MHD_ART_TEXT: Record<MhdArt, string> = { mhd: "Mindestens haltbar bis", verbrauch: "Zu verbrauchen bis" };

function tagNr(iso: string): number {
  const [j, m, t] = iso.split("-").map(Number);
  return Math.round(Date.UTC(j, m - 1, t) / 86_400_000);
}

/** Kalendertag plus `tage`. Reine Kalenderrechnung, keine Zone: ein Kalendertag hat keine. */
export function plusTage(iso: string, tage: number): string {
  return new Date((tagNr(iso) + tage) * 86_400_000).toISOString().slice(0, 10);
}

/** Kalendertage bis zum MHD. 0 = läuft heute ab (heute noch gut), negativ = abgelaufen. */
export function tageBis(mhd: string, heute: string): number {
  return tagNr(mhd) - tagNr(heute);
}

/** Ist das ein echter Kalendertag `JJJJ-MM-TT` (kein 31.02.)? */
export function istKalendertag(wert: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(wert)) return false;
  const [j, m, t] = wert.split("-").map(Number);
  const d = new Date(Date.UTC(j, m - 1, t));
  return d.getUTCFullYear() === j && d.getUTCMonth() === m - 1 && d.getUTCDate() === t;
}

export interface MhdStatus {
  ampel: Ampel;
  tage: number;
  abgelaufen: boolean;
  /** Verbrauchsdatum überschritten: darf nicht mehr ausgegeben werden (Entscheidung 2026-11-01). */
  gesperrt: boolean;
}

export interface Schwellen {
  rotTage: number;
  gelbTage: number;
  mhdArt: MhdArt;
}

export function mhdStatus(mhd: string, a: Schwellen, heute: string): MhdStatus {
  const tage = tageBis(mhd, heute);
  const abgelaufen = tage < 0;
  const ampel: Ampel = abgelaufen || tage <= a.rotTage ? "rot" : tage <= a.gelbTage ? "gelb" : "ok";
  return { ampel, tage, abgelaufen, gesperrt: abgelaufen && a.mhdArt === "verbrauch" };
}

/** Ausgabe nach Ablauf zuerst: früheres MHD vor späterem, bei Gleichstand älterer Eingang. */
export function fefo<T extends { mhd: string; eingang: string }>(chargen: readonly T[]): T[] {
  return [...chargen].sort((a, b) => a.mhd.localeCompare(b.mhd) || a.eingang.localeCompare(b.eingang));
}

/**
 * Welche Charge geht zuerst raus? Die früheste, die nicht abgelaufen ist; gibt es keine, die früheste
 * ausgebbare (abgelaufenes MHD nur nach Sichtprüfung). Gesperrte nie.
 */
export function vorschlag<T extends { status: MhdStatus; mhd: string; eingang: string }>(chargen: readonly T[]): T | undefined {
  const ausgebbar = fefo(chargen).filter((c) => !c.status.gesperrt);
  return ausgebbar.find((c) => !c.status.abgelaufen) ?? ausgebbar[0];
}

export function restText(tage: number): string {
  if (tage < -1) return `seit ${-tage} Tagen abgelaufen`;
  if (tage === -1) return "seit gestern abgelaufen";
  if (tage === 0) return "läuft heute ab";
  if (tage === 1) return "läuft morgen ab";
  return `läuft in ${tage} Tagen ab`;
}

export function restKurz(tage: number): string {
  if (tage < 0) return tage === -1 ? "seit 1 Tag ab" : `seit ${-tage} Tagen ab`;
  if (tage === 0) return "heute";
  if (tage === 1) return "morgen";
  return `in ${tage} Tagen`;
}

/** Kurzwort der Ampel neben dem Datum; gesperrte Ware sagt es ausdrücklich. */
export function ampelText(s: MhdStatus): string {
  return s.gesperrt ? `gesperrt · ${restKurz(s.tage)}` : restKurz(s.tage);
}

export function datumLang(iso: string): string {
  const [j, m, t] = iso.split("-");
  return `${t}.${m}.${j}`;
}

export function datumKurz(iso: string): string {
  const [j, m, t] = iso.split("-");
  return `${t}.${m}.${j.slice(2)}`;
}

export function zahlText(menge: number): string {
  return Number.isInteger(menge) ? String(menge) : menge.toLocaleString("de-DE", { maximumFractionDigits: 3 });
}

const MEHRZAHL: Record<string, string> = { Dose: "Dosen", Flasche: "Flaschen", Packung: "Packungen", Karton: "Kartons", Laib: "Laibe" };

/** Einheit in der richtigen Zahl („1 Dose“, „4 Dosen“, „1,5 kg“). */
export function einheitText(menge: number, einheit: string): string {
  if (TEILBAR.includes(einheit)) return einheit;
  return menge === 1 ? einheit : (MEHRZAHL[einheit] ?? einheit);
}

export function mengeText(menge: number, einheit: string): string {
  return `${zahlText(menge)} ${einheitText(menge, einheit)}`;
}

/** Rundet auf drei Nachkommastellen, damit 0,1 + 0,2 nicht 0,30000000000000004 kg ergibt. */
export function runde(menge: number): number {
  return Math.round(menge * 1000) / 1000;
}
