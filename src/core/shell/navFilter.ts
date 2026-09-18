import type { SuiteNavItem } from "@/core/shell/types";

/**
 * DIE REINE HAELFTE DES LANGEN MENUES — Schwelle und Filterung, ohne DOM.
 *
 * Eigene Datei und KEIN "use client": die Schwelle wird auch dort gebraucht,
 * wo kein Browser ist (Tests, und kuenftig moeglicherweise eine Server
 * Component, die ueber ihre eigene Navigation urteilt). Ein "use client" hier
 * gaebe einer Server Component eine Client-Referenz statt des Wertes — HTTP
 * 500, das weder `build` noch Vitest sieht (`docs/design/README.md`, Falle 6).
 */

/**
 * AB WANN EINE NAVIGATION „LANG" IST — und damit Filterfeld und aufklappbare
 * Abschnitte bekommt.
 *
 * Die Zahl ist keine Schoenheitsgrenze, sie ist gemessen an dem, was heute im
 * Repo steht: `lagerbuch` fuehrt 21 Eintraege in sechs Abschnitten (in der
 * Seitenleiste rund 1120px, also auf einem 900px-Schirm etwa 300px Scrollweg;
 * im Drawer mit 56px-Zeilen rund 1400px). Die naechstgroeszen sind `radio` mit
 * 7 und `zeichen` mit 6 — dazwischen liegt nichts. Jede Zahl von 8 bis 21
 * teilt dieselbe Menge; 12 sitzt mit Abstand nach beiden Seiten und laesst
 * damit Raum, ohne dass ein Modul bei jedem neuen Eintrag ueber die Schwelle
 * kippt.
 *
 * ⚠️ DIE SCHWELLE IST DER GRUND, WARUM DIESE AENDERUNG KEIN ANDERES MODUL
 * ANFASST. `radio` (7), `aufgaben` (bis 8), `zeichen` (6), `uav` (3) und
 * `files` (3) rendern danach exakt dasselbe Markup wie vorher — kein
 * Filterfeld, keine Schalter, keine zusaetzliche Bedienung fuer eine Liste,
 * die auf einen Blick passt. `navFilter.test.ts` haelt das an den echten
 * Navigationen fest.
 */
export const NAV_LANG_AB_EINTRAEGEN = 12;

export function istLangeNav(nav: readonly SuiteNavItem[]): boolean {
  return nav.length >= NAV_LANG_AB_EINTRAEGEN;
}

/**
 * Umlaute WEG — fuer die eine Halfte des Vergleichs.
 *
 * `Prüfungen` wird `prufungen`. Wer `pru` tippt, findet es damit.
 */
function ohneUmlaut(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss");
}

/**
 * Umlaute AUSGESCHRIEBEN — fuer die andere Haelfte.
 *
 * `Prüfungen` wird `pruefungen`. Wer `pruef` tippt (die Schreibweise ohne
 * Umlauttaste, und in dieser Suite die haeufigere — der halbe Quelltext
 * schreibt so), findet es damit.
 *
 * ⚠️ BEIDE FORMEN, NICHT EINE. Mit nur der ersten faende `pruef` nichts, mit
 * nur der zweiten faende `ub` kein „Übersicht". Der Vergleich unten haelt
 * deshalb beide Seiten in beiden Formen gegeneinander — bei zwei Dutzend
 * Eintraegen ist das ein Nichts an Rechenzeit und der Unterschied zwischen
 * „findet" und „findet nicht".
 */
function mitUmlautAusgeschrieben(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");
}

/**
 * Trifft `suche` diesen Text? Substring, nicht Praefix: gesucht wird hier ein
 * Menuepunkt, dessen Anfang man oft gerade NICHT weiss („etiketten" findet
 * „Artikeletiketten" und „Ortsetiketten").
 */
export function trifft(text: string, suche: string): boolean {
  return (
    ohneUmlaut(text).includes(ohneUmlaut(suche)) ||
    mitUmlautAusgeschrieben(text).includes(mitUmlautAusgeschrieben(suche))
  );
}

/**
 * Die Eintraege, die zur Sucheingabe passen — in unveraenderter Reihenfolge.
 *
 * ⚠️ GEPRUEFT WIRD AUCH DER ABSCHNITT, und das ist kein Beiwerk: wer
 * „Prüfungen" tippt, meint die drei Eintraege darunter, nicht eine Zeile mit
 * diesem Namen (es gibt keine). Ohne diese Haelfte faende die Suche nach einer
 * Ueberschrift, die gut sichtbar in der Leiste steht, nichts — und das liest
 * sich wie ein Defekt.
 *
 * Eine LEERE Suche liefert die ganze Liste zurueck (dieselbe Referenz), nicht
 * eine leere: der Aufrufer soll nicht zwischen „nichts eingegeben" und „nichts
 * gefunden" unterscheiden muessen.
 */
export function filtereNav(nav: SuiteNavItem[], suche: string): SuiteNavItem[] {
  const eingabe = suche.trim();
  if (!eingabe) return nav;
  return nav.filter(
    (eintrag) => trifft(eintrag.title, eingabe) || (!!eintrag.abschnitt && trifft(eintrag.abschnitt, eingabe)),
  );
}
