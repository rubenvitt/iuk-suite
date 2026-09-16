/**
 * DIE GEOMETRIE DES A7-ORTSETIKETTS — DRK-312.
 *
 * KEIN "use client". Diese Werte liest die Client-Insel `OrtsetikettenBogen.tsx`
 * UND der serverseitige Quelltext-Scan `ortsetiketten/druck.test.ts`. Ein Wert
 * aus einem als Client markierten Modul kommt in einer Server Component nicht
 * als Wert an, sondern als Client-Referenz — HTTP 500 fuer die ganze Seite,
 * waehrend `typecheck` und `build` gruen bleiben und Vitest es strukturell nicht
 * sehen kann (Falle 6, CLAUDE.md).
 *
 * WARUM NEBEN `etikettMasse.ts` UND NICHT DARIN: jenes traegt die Masse EINES
 * GEKAUFTEN BOGENS Klebeetiketten (48,5 x 25,4 mm, Raster auf A4). Diese hier
 * sind ein PAPIERFORMAT — A7, ein Etikett je Blatt. Die beiden Saetze haben
 * verschiedene Quellen, verschiedene Lebensdauern und keinen gemeinsamen Wert;
 * in einer Datei laese sich der eine als Variante des anderen. Was sie teilen,
 * ist die Umrechnung: `mm` kommt von dort und wird hier nicht zweitgeschrieben.
 */
import { mm } from "./etikettMasse";

export { mm };

/**
 * A7 IST 74 x 105 MM, UND ES MUSS ALS ZAHLENPAAR IM CSS STEHEN.
 *
 * ⚠️ `@page { size: A7 }` IST IN CHROMIUM STILL WIRKUNGSLOS — gemessen, nicht
 * vermutet (echter Chromium 1194, `page.pdf({ preferCSSPageSize: true })`,
 * MediaBox aus dem erzeugten PDF gelesen):
 *
 *   size: A4            → 209,9 x 297,0 mm   (erkannt)
 *   size: A5            → 148,2 x 209,9 mm   (erkannt)
 *   size: A6            → 215,9 x 279,4 mm   ← Letter, also die VORGABE
 *   size: A7            → 215,9 x 279,4 mm   ← Letter, also die VORGABE
 *   size: 74mm 105mm    →  74,1 x 105,2 mm   (erkannt)
 *
 * Chromiums Schluesselwortliste endet bei A5/B5; `A6`, `A7` und `A8` fallen
 * schon beim PARSEN heraus — `document.styleSheets` gibt die Regel als
 * `"@page { }"` zurueck, die Deklaration existiert danach gar nicht mehr.
 * **Kein Tor sieht das:** es ist gueltiges CSS nach Spezifikation, `pnpm build`
 * serialisiert die Datei klaglos, `lint` kennt keine Papierformate, und Vitest
 * kann es strukturell nicht sehen — jsdom hat keine Seitenaufteilung. Wer
 * `size: A7` schreibt, bekommt ein Etikett im Vorgabeformat des Druckers, und
 * zwar erst auf dem Papier.
 *
 * ⚠️ DIE ZWEITE HAELFTE IST NOCH STILLER: chromium verwirft die CSS-Groesse
 * VOLLSTAENDIG, sobald ein Dokument GEMISCHTE Seitengroessen ergibt. Gemessen:
 * eine A7-Karte und ein A4-Etikettenbogen im selben Dokument ergaben Letter fuer
 * BEIDE Seiten. Daraus folgt die Bauform dieser Seite — auf ihr traegt ALLES,
 * was gedruckt wird, `page: a7`; das Bildschirm-Chrome faellt vorher ueber
 * `lb-nichtDrucken` weg und zaehlt damit nicht mit (ebenfalls gemessen).
 */
export const A7_BREITE_MM = 74;
export const A7_HOEHE_MM = 105;

/**
 * DER NAME DER BENANNTEN SEITE. Sie MUSS benannt sein: `(druck)/druck.css` ist
 * EIN Stylesheet fuer drei Druckflaechen (Etikettenbogen A4, Checklisten A4,
 * diese Karten A7), und ein unbenanntes `@page { size: ... }` gaelte fuer alle
 * drei. Die unbenannte Regel daneben (`@page { margin: 8mm }`) bleibt davon
 * unberuehrt — gemessen: mit beiden Regeln im selben Stylesheet kommen die
 * A7-Seiten mit 74,1 x 105,2 mm heraus.
 */
export const A7_SEITENNAME = "a7";

/** Der Rand des Blattes. Innerhalb davon liegt die Karte. */
export const ORT_SEITENRAND_MM = 5;

/**
 * Die Karte fuellt den bedruckbaren Bereich GENAU aus — sie ist nicht kleiner
 * und nicht groesser. Das ist die Bedingung dafuer, dass eine Karte eine Seite
 * ist: eine kleinere liesse zwei auf ein Blatt rutschen, eine groessere wuerfe
 * hinter jeder Karte eine fast leere zweite Seite aus.
 */
export const ORT_KARTE_BREITE_MM = A7_BREITE_MM - 2 * ORT_SEITENRAND_MM;   // 64
export const ORT_KARTE_HOEHE_MM = A7_HOEHE_MM - 2 * ORT_SEITENRAND_MM;    // 95

/**
 * DER QR — 46 mm, und das ist der eigentliche Zweck des Formats.
 *
 * Das Regaletikett traegt 20 mm auf 48,5 x 25,4 mm; das reicht fuer einen
 * Griff ins Regal, aus 20 cm Abstand. Eine Karte am Fahrzeug wird im Vorbeigehen
 * gescannt, mit einer Hand, oft in schlechtem Licht — mehr als das Doppelte an
 * Kantenlaenge ist genau der Unterschied, um den es im Ticket geht
 * („gut nutzbarer QR-Code").
 */
export const ORT_QR_MM = 46;

/**
 * DIE ZEILEN, DIE DIE FUSSZEILE FEST BELEGT — und der Grund, warum die
 * Stufentabelle unten ueberhaupt gilt.
 *
 * ⚠️ FEST RESERVIERT, NICHT „so viele, wie gebraucht werden". Die Laenge der
 * Adresse haengt an `SUITE_HOST_LAGERBUCH`, also an der Konfiguration; waechst
 * sie um eine Zeile, schrumpfte der Namenskasten und jede gemessene Zahl unten
 * waere daneben. Gemessen: der Namensplatz ist mit der Reservierung bei
 * Adressen von 35 bis 184 Zeichen konstant 89px.
 *
 * Drei Zeilen tragen gemessen rund 130 Zeichen — `https://` plus einen 100
 * Zeichen langen Host plus `/o/` und die 21-stellige Id. Wird es laenger,
 * endet die ADRESSE sichtbar auf „…" und nicht der Name.
 */
export const ORT_FUSS_ZEILEN = 3;

/**
 * DIE ZEILEN DER BEIZEILE — die zweite feste Groesse, an der die Stufentabelle
 * haengt.
 *
 * ⚠️ AUS DEMSELBEN GRUND FEST WIE DIE FUSSZEILE, und der Ausloeser ist eine
 * andere unbegrenzte Angabe: `lagerorte.kennung` kennt keine Obergrenze
 * (`_actions/fahrzeuge.ts`: `z.string().trim().optional()`). Gemessen ohne
 * Reservierung: „Fahrzeug · HN-DRK-1101" ergab 13px Beizeile und 89px
 * Namensplatz, eine laengere Kennung 26px/76px, eine sehr lange 39px/63px —
 * und eine Kennung ohne Trennstellen ragte seitlich aus der Karte.
 *
 * ⚠️ EINE ZEILE UND NICHT ZWEI: die zweite kostete JEDE Karte 13px
 * Namenshoehe, dauerhaft, fuer einen seltenen Fall. Ein Kennzeichen ist kurz —
 * „Fahrzeug · HN-DRK-1101" braucht gemessen 155 von 212px. Was nicht passt,
 * endet sichtbar auf „…", und abgeschnitten wird das Ende der Kennung, nie die
 * Art: die steht vorn.
 */
export const ORT_META_ZEILEN = 1;

/**
 * DIE SCHRIFTSTUFEN DES ORTSNAMENS — Codex-Befund P2 zu PR #177.
 *
 * ⚠️ DIE KARTE SCHNITT DEN NAMEN AB 24 ZEICHEN AB, UND ZWAR STILL. Gemessen an
 * echtem Chromium gegen `druck.css` im Druckmedium (`scrollHeight` gegen
 * `clientHeight` am Namensfeld UND an der Karte):
 *
 *   „RTW 1"                               5 Zeichen   passt
 *   „Rucksack Betreuung EE 3"            23 Zeichen   passt
 *   „Rucksack Betreuung Einsatzeinheit 3" 35 Zeichen  ABGESCHNITTEN
 *   „Mannschaftstransportwagen …"         76 Zeichen  ABGESCHNITTEN
 *
 * Das ist kein Grenzfall: `createFahrzeug` kennt keine Obergrenze
 * (`_actions/fahrzeuge.ts`: nur `min(1)`), und schon der lokale Seed fuehrt
 * „Sanitätstasche 1" mit 16 Zeichen — ein Name wie „Rucksack Betreuung
 * Einsatzeinheit 3" ist voellig gewoehnlich. `overflow-wrap: anywhere` hilft
 * dagegen NICHT: es schafft Trennstellen, aber keinen Platz.
 *
 * ⚠️ WARUM KEINE LAENGENGRENZE AM EINGANG. Sie waere die naheliegende Abhilfe
 * und die falsche: sie aenderte einen Schreibpfad, den dieses Ticket nicht
 * beauftragt hat, und bestehende Zeilen koennen die Grenze laengst
 * ueberschreiten — die waeren dann nicht etwa abgeschnitten, sondern gar nicht
 * mehr bearbeitbar.
 *
 * ⚠️ JEDE ZAHL HIER IST GEMESSEN, KEINE GERECHNET. Ermittelt wurde je Schriftgrad
 * die groesste Zeichenzahl, bei der WEDER das Namensfeld NOCH die Karte
 * ueberlaeuft — und zwar gegen den schlechteren von zwei Faellen: einen Text mit
 * Worttrennstellen und ein einzelnes Wort ohne jede.
 *
 * ⚠️ DIE MESSREIHE GILT NUR, WEIL DER NAMENSPLATZ KONSTANT IST — und das ist er
 * erst, seit die Fusszeile eine FESTE Hoehe hat (`.lb-ortkarteUrl` in
 * `druck.css`, Codex P2 zweite Runde). Vorher hing er an der Laenge von
 * `SUITE_HOST_LAGERBUCH`: gemessen 99px bei `http://lagerbuch.iuk-ue.de`, 89px
 * bei einem 45 Zeichen langen Host. Eine Tabelle, die an einer
 * Umgebungsvariablen haengt, ist keine Tabelle.
 *
 * ⚠️ UND DIE KLAMMER RETTET DAS NICHT, auch wenn ein frueherer Kommentar an
 * dieser Stelle genau das behauptet hat — die Aussage war falsch: schrumpft der
 * Kasten, bleibt die Klammer bei ihrer festen Zeilenzahl, und `overflow:
 * hidden` schneidet VOR der letzten Zeile und damit VOR den
 * Auslassungspunkten. Der stille Schnitt waere zurueck. Die Klammer faengt, was
 * auch bei konstantem Platz nicht passt; die feste Fusshoehe haelt den Platz
 * konstant. Es braucht beides.
 */
export type NameStufe = {
  /** Die Modifikatorklasse in `druck.css`. */
  klasse: string;
  /** Schriftgrad in Punkt. */
  pt: number;
  /** Groesste gemessen passende Zeichenzahl; `null` ist die letzte Stufe. */
  bisZeichen: number | null;
  /**
   * Laengstes Wort, das bei diesem Grad ohne Mittenbruch auf eine Zeile passt.
   *
   * ⚠️ DIE ZWEITE SPALTE IST NICHT DIE ERSTE NOCH EINMAL, und ohne sie sah die
   * Karte schlecht aus, obwohl nichts abgeschnitten war: „Sanitätstasche 1"
   * hat nur 16 Zeichen, passt also in die groesste Stufe — aber das Wort
   * „Sanitätstasche" allein ist auf 64mm bei 20pt zu breit und brach als
   * „Sanitätstasch / e 1" um. Gemessen am breitesten realistischen
   * Buchstabensatz (Grossbuchstaben, „m"/„w"), nicht am guenstigsten.
   */
  bisWort: number;
  /** Zeilen, die bei diesem Grad in das Namensfeld passen — der Klammerwert. */
  zeilen: number;
};

export const NAME_STUFEN: readonly NameStufe[] = [
  { klasse: "lb-ortkarteNameXl", pt: 20, bisZeichen: 21, bisWort: 11, zeilen: 3 },
  { klasse: "lb-ortkarteNameL", pt: 16, bisZeichen: 27, bisWort: 14, zeilen: 3 },
  { klasse: "lb-ortkarteNameM", pt: 13, bisZeichen: 48, bisWort: 17, zeilen: 4 },
  { klasse: "lb-ortkarteNameS", pt: 11, bisZeichen: 70, bisWort: 20, zeilen: 5 },
  /**
   * ⚠️ DIE LETZTE STUFE IST NICHT „unendlich viel passt", sondern „hier hoert
   * das Verkleinern auf". Gemessen traegt sie 119 Zeichen; darueber greift die
   * Klammer und der Name endet sichtbar auf „…". Das ist der eigentliche Punkt
   * der Stufen: ein abgeschnittener Name ist hinnehmbar, ein STILL
   * abgeschnittener nicht — auf einem laminierten Kaertchen sieht niemand, dass
   * da noch etwas stand.
   *
   * Weiter zu verkleinern waere eine Scheinloesung: unter 9pt ist ein Name auf
   * Armeslaenge nicht mehr zu lesen, und ein unlesbarer Name ist kein besserer
   * als ein gekuerzter.
   */
  { klasse: "lb-ortkarteNameXs", pt: 9, bisZeichen: null, bisWort: 24, zeilen: 7 },
];

/**
 * Die Modifikatorklasse fuer einen Ortsnamen — die erste Stufe, die BEIDE
 * Bedingungen erfuellt.
 *
 * ⚠️ BEIDE, UND ZWAR UND-VERKNUEPFT. Die Gesamtlaenge entscheidet, ob der Name
 * in die HOEHE passt; das laengste Wort entscheidet, ob er ohne Mittenbruch in
 * die BREITE passt. Wer nur die erste prueft, bekommt „Sanitätstasch / e 1" —
 * nichts abgeschnitten, und trotzdem falsch.
 *
 * ⚠️ UEBER CODEPUNKTE, NICHT UEBER `name.length`: jenes zaehlt UTF-16-Einheiten,
 * und ein Zeichen ausserhalb der BMP zaehlte doppelt. Bei deutschen Umlauten
 * macht es keinen Unterschied — bei einem Namen, in dem jemand ein Zeichen
 * benutzt, das die Tabelle oben nie gesehen hat, waere die Stufe sonst still
 * zu klein.
 *
 * ⚠️ DIE WORTBEDINGUNG IST EIN WUNSCH, DIE LAENGENBEDINGUNG EINE ZUSAGE — und
 * wenn sie sich widersprechen, gewinnt die Laenge. „Mannschaftstransportwagen"
 * hat 25 Zeichen und passt auf KEINER Stufe auf eine Zeile; wuerde die
 * Wortbedingung dann bis zur letzten Stufe durchschlagen, staende ein Name mit
 * 57 Zeichen in 9pt da, obwohl 13pt ihn vollstaendig trueden. Der Preis waere
 * falsch herum bezahlt: ein Mittenbruch ist haesslich, eine zu kleine Schrift
 * auf einem laminierten Kaertchen ist unbenutzbar.
 */
export function nameStufe(name: string): string {
  const zeichen = [...name].length;
  const laengstesWort = Math.max(
    0,
    ...name.split(/\s+/).filter(Boolean).map((w) => [...w].length),
  );
  const passtInDieHoehe = (s: NameStufe) => s.bisZeichen === null || zeichen <= s.bisZeichen;

  const beides = NAME_STUFEN.find((s) => passtInDieHoehe(s) && laengstesWort <= s.bisWort);
  if (beides) return beides.klasse;

  // Kein Grad bekommt das laengste Wort auf eine Zeile. Dann entscheidet allein
  // die Hoehe, und der Bruch passiert — in lesbarer Groesse.
  const nurHoehe = NAME_STUFEN.find(passtInDieHoehe);
  return (nurHoehe ?? NAME_STUFEN[NAME_STUFEN.length - 1]!).klasse;
}
