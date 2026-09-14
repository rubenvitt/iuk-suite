/**
 * Die Artikelkategorie aus DRK-294 — Freitext, und deshalb eine Regel, wann zwei
 * Eingaben DIESELBE Kategorie sind.
 *
 * Kein "use client": Server Action, Lesepfad und die Client-Insel der Tabelle
 * lesen dieselben Funktionen (Falle 6).
 *
 * ZWEI FORMEN, NICHT EINE: die SCHREIBWEISE steht am Artikel und wird angezeigt,
 * der SCHLUESSEL ist gefaltet und entscheidet Gleichheit — im Filter und in der
 * gespeicherten Auswahl je Konto. Die Faltung ist `falte()` aus `./suche`, die
 * eine des Moduls; ein eigenes `toLowerCase()` hier liefe mit ihr auseinander,
 * sobald sie sich aendert.
 *
 * NICHT GROSS GESCHRIEBEN wie das Fach in der Schublade: das Fach ist ein Kuerzel
 * („A3"), die Kategorie ein Wort, und die Schreibweise gehoert der Person, die sie
 * vergibt.
 */
import { falte } from "./suche";

/** Zeichen einer getrimmten Kategorie — ein Wort oder zwei, kein Absatz. */
export const KATEGORIE_MAX_LAENGE = 60;

/** Eintraege einer gespeicherten Auswahl je Konto. Weit ueber jedem echten
 *  Bestand; die Zahl deckelt nur eine Anfrage, die keine Oberflaeche schickt. */
export const KATEGORIEN_AUSWAHL_MAX = 200;

/** Getrimmt; leer oder nur Leerzeichen heisst „ohne Kategorie" (`null`). */
export function kategorieNormalisieren(roh: string | null | undefined): string | null {
  const wert = roh?.trim() ?? "";
  return wert === "" ? null : wert;
}

export function kategorieSchluessel(kategorie: string): string {
  return falte(kategorie.trim());
}

export type KategorieOption = { schluessel: string; label: string };

/**
 * Die vergebenen Kategorien als Vorschlaege und Filteroptionen — je Schluessel
 * einmal, deutsch sortiert. Die Beschriftung ist die HAEUFIGSTE Schreibweise;
 * ein Gleichstand faellt nach deutscher Sortierung, damit dieselben Daten immer
 * dieselbe Liste ergeben.
 */
export function kategorieOptionen(werte: readonly (string | null)[]): KategorieOption[] {
  const zaehler = new Map<string, Map<string, number>>();
  for (const roh of werte) {
    const wert = kategorieNormalisieren(roh);
    if (wert === null) continue;
    const schluessel = kategorieSchluessel(wert);
    const schreibweisen = zaehler.get(schluessel) ?? new Map<string, number>();
    schreibweisen.set(wert, (schreibweisen.get(wert) ?? 0) + 1);
    zaehler.set(schluessel, schreibweisen);
  }
  return Array.from(zaehler, ([schluessel, schreibweisen]) => {
    const [label] = Array.from(schreibweisen)
      .sort(([a, na], [b, nb]) => nb - na || a.localeCompare(b, "de"))[0]!;
    return { schluessel, label };
  }).sort((a, b) => a.label.localeCompare(b.label, "de") || a.schluessel.localeCompare(b.schluessel));
}
