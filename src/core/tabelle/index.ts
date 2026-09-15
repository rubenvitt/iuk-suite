/**
 * Die Tabellen-Werkzeuge der Suite an EINER Importstelle.
 *
 * ⚠️ KEIN "use client" HIER, und das ist keine Nachlässigkeit. Diese Datei
 * re-exportiert sowohl eine Client-Komponente (`Datentabelle`) als auch reine
 * Werte (`nachText`, `werteAlsFilter`, `scrollMasse`). Trüge sie selbst
 * `"use client"`, kämen die reinen Werte in einer Server Component als
 * Client-Referenz an statt als Funktion — HTTP 500 für die ganze Seite, das
 * `build` nicht sieht und Vitest strukturell nicht sehen KANN (Falle 6).
 * `Datentabelle.tsx` trägt die Direktive selbst; ein Re-Export reicht sie
 * korrekt weiter.
 */
export { Datentabelle, type DatentabelleProps } from "./Datentabelle";
export { useEntprellt } from "./useEntprellt";
export {
  breitenSumme,
  scrollMasse,
  BREITE_NACH_INHALT,
  type MassSpalte,
  type Scrollmass,
} from "./masse";
export { nachDatum, nachJaNein, nachRang, nachText, nachZahl } from "./sortierer";
export {
  OHNE_WERT,
  trifftWert,
  werteAlsFilter,
  zustandsFilter,
  type Filterwert,
} from "./spaltenfilter";
export { TabellenVollhoehe, type TabellenVollhoeheProps } from "./TabellenVollhoehe";
export { vollhoehe, type VollhoeheEingabe, type VollhoeheErgebnis } from "./vollhoehe";
export { VIRTUELL_AB_ZEILEN } from "./masse";
export {
  angezeigteAnzahl,
  angezeigteZeilen,
  blattSpalten,
  filterAktiv,
  filterAusSpalten,
  spaltenSchluessel,
  wendeFilterAn,
  wendeSortierungAn,
  type AnzeigeSpalte,
  type FilterZustand,
  type SortRichtung,
  type SortZustand,
} from "./angezeigt";
