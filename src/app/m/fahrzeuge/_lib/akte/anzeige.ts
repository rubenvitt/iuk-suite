/**
 * Was Tafel, Hallentafel und Akte gemeinsam anzeigen (IDA-299) — reine Funktionen ohne `"use client"`,
 * damit Server-Seiten (Hallentafel) und Client-Inseln sie gleich lesen (Falle 6).
 */
import type { FahrzeugDTO } from "../daten";
import { STUFEN, type AkteMitStand, type PruefArt, type PruefStand, type ReifenTeil, type ReifenStand, type Stufe } from "./typen";

/** Typ und Funkkenner, ohne Funkkenner der Funkrufname — dieselbe Regel wie `kurzname` in `_lib/bereitstellung.ts`. */
export function fahrzeugTitel(f: Pick<FahrzeugDTO, "typ" | "funkkenner" | "funkrufname">): string {
  return f.funkkenner ? `${f.typ} ${f.funkkenner}` : f.funkrufname;
}

/** „HN-DRK-1001 · Uelzen“; ohne Kennzeichen nur der Standort. */
export function fahrzeugUnterzeile(f: Pick<FahrzeugDTO, "kennzeichen" | "standort">): string {
  return [f.kennzeichen, f.standort].filter(Boolean).join(" · ");
}

const rang = (s: Stufe): number => STUFEN.indexOf(s);

/** Schlimmste zuerst (Rangfolge `STUFEN`), bei gleicher Stufe bleibt die Reihenfolge der Liste. */
export function schlimmsteZuerst(liste: readonly AkteMitStand[]): AkteMitStand[] {
  return liste.map((x, i) => ({ x, i })).sort((a, b) => rang(a.x.stand.stufe) - rang(b.x.stand.stufe) || a.i - b.i).map((y) => y.x);
}

export function pruefungenDerArt(stand: AkteMitStand["stand"], art: PruefArt): PruefStand[] {
  return stand.pruefungen.filter((p) => p.pruefung.art === art);
}

/** Die schlimmste aus mehreren Prüfungen; bei Gleichstand die erste. `null` bei leerer Liste. */
export function schlimmstePruefung(liste: readonly PruefStand[]): PruefStand | null {
  return liste.reduce<PruefStand | null>((m, p) => (m === null || rang(p.stufe) < rang(m.stufe) ? p : m), null);
}

/** Von Saison und Alter der Teil, der auf die Tafel gehört: der schlimmere, bei Gleichstand die Saison. */
export function reifenTeil(r: ReifenStand): ReifenTeil {
  return rang(r.saison.stufe) <= rang(r.alter.stufe) ? r.saison : r.alter;
}

/**
 * Volle Jahre seit der Herstellwoche eines Satzes (`WWJJ`), für die eingelagerten Sätze der Akte — den
 * aufgezogenen rechnet die Fristrechnung selbst (`ReifenStand.alterJahre`). `null` bei einer DOT, die
 * keine ist.
 */
export function dotAlterJahre(dot: string, heute: string): number | null {
  if (!/^\d{4}$/.test(dot)) return null;
  const woche = Number(dot.slice(0, 2));
  const jahr = 2000 + Number(dot.slice(2));
  if (woche < 1 || woche > 53) return null;
  const hergestellt = Date.UTC(jahr, 0, 1) + (woche - 1) * 7 * 86_400_000;
  const [j, m, t] = heute.split("-").map(Number);
  const h = new Date(hergestellt);
  let jahre = j - h.getUTCFullYear();
  if (m - 1 < h.getUTCMonth() || (m - 1 === h.getUTCMonth() && t < h.getUTCDate())) jahre -= 1;
  return Math.max(0, jahre);
}

export const jahreText = (n: number): string => (n === 1 ? "1 Jahr" : `${n} Jahre`);

/** „alle 12 Monate oder 30.000 km“ — der Kilometertext kommt fertig von außen (`kmText`). */
export function abstandText(monate: number, kmAbstand: string | null): string {
  return `${monate === 1 ? "jeden Monat" : `alle ${monate} Monate`}${kmAbstand ? ` oder ${kmAbstand}` : ""}`;
}

/* ---------- Maße: die Oberfläche spricht Meter mit Komma, gespeichert sind Zentimeter ---------- */

/** 530 → „5,30“. */
export function cmAlsMeter(cm: number | null): string {
  return cm == null ? "" : (cm / 100).toFixed(2).replace(".", ",");
}

/**
 * „5,30“, „5.3“ oder „5“ → 530. Leer → `null` (nicht erfasst). Was keine Meterangabe ist → `"ungueltig"`;
 * die Oberfläche meldet das am Feld, statt eine geratene Zahl zu speichern.
 */
export function meterAlsCm(text: string): number | null | "ungueltig" {
  const t = text.trim();
  if (t === "") return null;
  if (!/^\d{1,2}([.,]\d{1,2})?$/.test(t)) return "ungueltig";
  return Math.round(Number(t.replace(",", ".")) * 100);
}

/** 3200 → „3.200 kg“. Von Hand gruppiert wie `kmText`, damit Server und Browser dasselbe schreiben. */
export function kgText(kg: number): string {
  return `${String(Math.round(kg)).replace(/\B(?=(\d{3})+$)/g, ".")} kg`;
}
