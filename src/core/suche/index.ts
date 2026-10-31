import type { Session } from "next-auth";

/**
 * DER VERTRAG DER SUITEWEITEN SUCHE (IDA-301).
 *
 * Es gibt keinen zentralen Index. Jedes Modul, das mitsucht, veröffentlicht EINE Funktion
 * `suiteSuche` in `_lib/suiteSuche.ts` und entscheidet darin selbst, ob die Sitzung seine Treffer
 * sehen darf — mit demselben Prädikat, das seine Seiten riegelt. Das Portal ruft die Funktionen nur
 * auf und zeigt, was zurückkommt. Ein Index im Portal läse an den Modul-Riegeln vorbei; genau das
 * schließt die Aufgabe aus.
 *
 * Hier in `core`, weil drei Module (radio, fahrzeuge, lagerbuch) und das Portal ihn teilen.
 * KEIN `"use client"`: der Vertrag wird nur serverseitig gelesen (Falle 6).
 */

/** Ein Merkmal des Treffers, z. B. `{ etikett: "Seriennummer", wert: "1234" }`. */
export interface SuchMerkmal {
  etikett: string;
  wert: string;
}

export interface SuchTreffer {
  /** Stabil innerhalb des Moduls (React-Schlüssel). */
  id: string;
  /** Was gefunden wurde: „Artikel“, „Funkgerät“, „Fahrzeug“ … */
  art: string;
  titel: string;
  merkmale: SuchMerkmal[];
  /** Pfad auf dem Host des Moduls, mit führendem Schrägstrich. Das Portal setzt den Host davor. */
  pfad: string;
}

export interface SuchAntwort {
  treffer: SuchTreffer[];
  /** Es gäbe mehr als `treffer.length`; die Seite sagt dann, dass man genauer suchen soll. */
  mehr: boolean;
}

/**
 * Die Funktion, die ein Modul veröffentlicht. `null` heißt: diese Sitzung darf das Modul nicht
 * durchsuchen — und dann erscheint es auch nicht als „ohne Treffer“, sondern gar nicht.
 *
 * Die Sitzung kommt ROH herein, damit jedes Modul sie mit seiner eigenen Lesart (`viewerAusSession`
 * o. ä.) auswertet und nicht mit einer zweiten, die das Portal erfunden hat.
 */
export type SuiteSuche = (begriff: string, sitzung: Session | null) => SuchAntwort | null;

/** Treffer je Modul. Wer mehr braucht, sucht genauer oder geht ins Modul. */
export const TREFFER_JE_MODUL = 10;

/** Unter dieser Länge wird nicht gesucht: ein Zeichen trifft fast alles. */
export const MINDESTLAENGE = 2;

/** Deckel für die Eingabe, damit niemand einen Roman in jede Modul-Abfrage schickt. */
export const HOECHSTLAENGE = 100;

/** Die Eingabe getrimmt und gedeckelt; `null`, wenn sie zu kurz ist. */
export function suchbegriff(roh: string | string[] | undefined): string | null {
  const wert = (Array.isArray(roh) ? roh[0] : roh)?.trim().slice(0, HOECHSTLAENGE) ?? "";
  return wert.length >= MINDESTLAENGE ? wert : null;
}

/** Gefaltet für den Vergleich: klein, ohne Leerraum-Unterschiede. Umlaute bleiben Umlaute. */
export function falte(wert: string): string {
  return wert.toLocaleLowerCase("de").replace(/\s+/g, " ").trim();
}

/** Trifft der Begriff (gefaltet) eines der Felder? Leere Felder treffen nie. */
export function trifft(gefalteterBegriff: string, ...felder: (string | null | undefined)[]): boolean {
  return felder.some((f) => f != null && f !== "" && falte(f).includes(gefalteterBegriff));
}

/** Kappt eine Trefferliste auf `TREFFER_JE_MODUL` und merkt, ob es mehr gab. */
export function kappe(treffer: SuchTreffer[], grenze = TREFFER_JE_MODUL): SuchAntwort {
  return { treffer: treffer.slice(0, grenze), mehr: treffer.length > grenze };
}

/** Merkmale ohne leere Werte — eine Zeile „Kennzeichen: “ ist Rauschen. */
export function merkmale(...paare: [string, string | null | undefined][]): SuchMerkmal[] {
  return paare.flatMap(([etikett, wert]) => (wert != null && wert.trim() !== "" ? [{ etikett, wert }] : []));
}
