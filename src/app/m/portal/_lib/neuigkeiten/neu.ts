/**
 * Was die Client-Insel der Neuigkeiten als WERT braucht — bewusst getrennt von `auswahl.ts`: jenes
 * Modul importiert das Register mit allen Notizen, und ein Wert daraus zöge die ganze Liste ins
 * Client-Bundle (IDA-391). Hier steht nichts, was Notizen lädt. Kein `"use client"` (Falle 6).
 */
import type { NeuigkeitenGesehen } from "@/app/m/portal/_db/schema";

/** Der Filterwert für „alle Apps". Kein Registry-Key heißt so (`register.test.ts` prüft die Keys). */
export const ALLE_APPS = "alle";

export function neuigkeitSchluessel(n: { modul: string; slug: string }): string {
  return `${n.modul}/${n.slug}`;
}

/** Neu ist, was nach dem gemerkten Tag liegt oder an jenem Tag noch nicht dabei war. */
export function istNeu(n: { modul: string; slug: string; datum: string }, seit: NeuigkeitenGesehen | null): boolean {
  if (!seit) return false;
  if (n.datum > seit.bis) return true;
  return n.datum === seit.bis && !seit.schluessel.includes(neuigkeitSchluessel(n));
}
