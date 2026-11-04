/**
 * IDA-342 — Fahrzeuge aus der Fahrzeugverwaltung im Gerät-Formular: die Auswahl und ihre Suche. Ohne
 * `"use client"` und ohne Datenbank, damit Formular (Client) und Action (Server) dieselbe Regel nutzen.
 * Woher die Liste kommt, steht in `fahrzeugbezug.ts`.
 */

export interface FahrzeugWahl {
  id: string;
  /** Der Name nach der Regel der Fahrzeugverwaltung (`kurzname`) — so steht er am Gerät. */
  name: string;
  funkrufname: string;
  kennzeichen: string | null;
  /** Normalisierter Suchtext über Name, Typ, Funkrufname, Funkkenner und Kennzeichen. */
  suche: string;
}

/** Klein, ohne Leer- und Trennzeichen: „11/83“ findet „11-83-1“, „hn drk“ findet „HN-DRK-1101“. */
export function normalisiert(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

/** Jedes Wort der Eingabe muss irgendwo vorkommen. Eine leere Eingabe passt auf alles. */
export function passt(w: Pick<FahrzeugWahl, "suche">, eingabe: string): boolean {
  return eingabe.split(/\s+/).map(normalisiert).filter(Boolean).every((t) => w.suche.includes(t));
}

/**
 * Das Fahrzeug, dessen Name genau so im Feld steht — sonst ist es Freitext (ein Fahrzeug von woanders). Tragen
 * zwei Fahrzeuge denselben Namen (ohne Funkkenner möglich), verknüpft nur die Auswahl eines Vorschlags.
 */
export function wahlZuName(wahl: FahrzeugWahl[], name: string): FahrzeugWahl | null {
  const n = name.trim();
  const treffer = n ? wahl.filter((w) => w.name === n) : [];
  return treffer.length === 1 ? treffer[0] : null;
}
