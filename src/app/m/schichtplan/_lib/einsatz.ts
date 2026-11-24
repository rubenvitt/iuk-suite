/**
 * Der Verweis einer Planung auf einen Einsatz in Lifeline Hub (IDA-416). Der Einsatz gehört dem Hub; die
 * Planung hält nur seine Kennung und die Adresse des Hubs, damit sie dorthin verlinken kann. Eingegeben
 * wird der Link aus der Adresszeile des Hubs (`https://hub…/einsaetze/42/etb`) oder nur die Nummer `42`.
 * Kein `"use client"`: Server Actions und das Formular lesen dieselbe Datei (Falle 6).
 */

export const LIFELINE_HUB = "lifeline-hub";

export interface EinsatzVerweis {
  system: typeof LIFELINE_HUB;
  /** Kennung des Einsatzes im Hub (eine Zahl, als Text gespeichert). */
  id: string;
  /** Ursprung des Hubs (`https://hub.example`), wenn ein Link eingegeben wurde; sonst `null`. */
  adresse: string | null;
}

const NUR_NUMMER = /^\d{1,12}$/;
const EINSATZ_PFAD = /^\/einsaetze\/(\d{1,12})(?:\/|$)/;

/** Liest Link oder Nummer; `null`, wenn es weder das eine noch das andere ist. */
export function einsatzAus(eingabe: string): EinsatzVerweis | null {
  const t = eingabe.trim();
  if (NUR_NUMMER.test(t)) return { system: LIFELINE_HUB, id: t, adresse: null };
  let url: URL;
  try {
    url = new URL(t);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const treffer = EINSATZ_PFAD.exec(url.pathname);
  return treffer ? { system: LIFELINE_HUB, id: treffer[1], adresse: url.origin } : null;
}

/** Der Link in den Hub, oder `null`, wenn nur die Nummer bekannt ist. */
export function einsatzLink(v: EinsatzVerweis): string | null {
  return v.adresse ? `${v.adresse}/einsaetze/${v.id}` : null;
}

/** So, wie das Formular den Verweis wieder anzeigt: als Link, sonst als Nummer. */
export const einsatzText = (v: EinsatzVerweis | null): string => (v ? einsatzLink(v) ?? v.id : "");
