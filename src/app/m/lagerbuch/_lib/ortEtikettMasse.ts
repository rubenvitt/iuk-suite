/**
 * DIE GEOMETRIE DES ORTSETIKETTS — DRK-312, Bogenformat seit DRK-388.
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
 * beschreiben Karten zum AUSSCHNEIDEN, acht je Blatt. Die beiden Saetze haben
 * verschiedene Quellen, verschiedene Lebensdauern und keinen gemeinsamen Wert;
 * in einer Datei laese sich der eine als Variante des anderen. Was sie teilen,
 * ist die Umrechnung: `mm` kommt von dort und wird hier nicht zweitgeschrieben.
 */
import { mm } from "./etikettMasse";

export { mm };

/**
 * DAS BLATT IST A4, UND ES MUSS ALS ZAHLENPAAR IM CSS STEHEN.
 *
 * ⚠️ `size: A4` WUERDE HIER SOGAR WIRKEN — und ist trotzdem die schlechtere
 * Wahl. Chromiums Schluesselwortliste endet bei A5/B5; `A6`, `A7` und `A8`
 * fallen schon beim PARSEN heraus (gemessen an echtem Chromium ueber
 * `page.pdf({ preferCSSPageSize: true })`, MediaBox aus dem erzeugten PDF:
 * `size: A4` → 209,9 x 297,0 mm, `size: A7` → 215,9 x 279,4 mm, also Letter).
 * Wer die Zeile spaeter auf ein kleineres Format umschreibt, bekommt STILL das
 * Vorgabeformat des Druckers. Zahlen kennen diese Klippe nicht, und genau
 * deshalb stehen hier Zahlen — die Bauform soll den naechsten Griff nicht
 * bestrafen.
 *
 * ⚠️ UND SIE MUSS UEBERHAUPT DASTEHEN. Ohne `size` nimmt Chromium das
 * Vorgabeformat (Letter, 215,9 x 279,4 mm) — das Raster unten rechnet dann auf
 * einem Blatt, das es nicht gibt, und die vierte Kartenreihe faellt auf die
 * naechste Seite.
 */
export const A4_BREITE_MM = 210;
export const A4_HOEHE_MM = 297;

/**
 * DER NAME DER BENANNTEN SEITE. Sie MUSS benannt sein: `(druck)/druck.css` ist
 * EIN Stylesheet fuer drei Druckflaechen (Etikettenbogen, Checklisten, diese
 * Karten), und ein unbenanntes `@page { size: ... }` gaelte fuer alle drei.
 * Die unbenannte Regel daneben (`@page { margin: 8mm }`) bleibt davon
 * unberuehrt — gemessen: mit beiden Regeln im selben Stylesheet kommen die
 * Kartenseiten mit 210 x 297 mm und dem Rand von hier heraus.
 *
 * ⚠️ DER NAME IST NICHT MEHR `a7`, UND DAS IST ABSICHT. Bis DRK-388 war eine
 * Karte ein A7-BLATT; heute ist sie eine von acht Karten auf einem A4-Blatt.
 * Ein Seitenname `a7` an einer 210 x 297 mm grossen Seite waere eine Falle fuer
 * den naechsten Leser.
 */
export const ORT_SEITENNAME = "ortbogen";

/**
 * DER RAND DES BLATTES — 4 mm, und die Zahl ist ein Kompromiss mit dem Drucker.
 *
 * ⚠️ NICHT 0, OBWOHL ACHT A7-KARTEN (74 x 105 mm) EIN A4-BLATT EXAKT KACHELN.
 * Kein gewoehnlicher Bueradrucker druckt randlos; was im unbedruckbaren
 * Streifen liegt, faellt weg. Bei Rand 0 traefe das genau die Schnittlinie der
 * aeusseren Karten — und ohne Schnittlinie ist ein Bogen mit acht Karten
 * muehsam zu zerteilen.
 */
export const ORT_SEITENRAND_MM = 4;

/** Das Raster auf dem Blatt: zwei Spalten, vier Zeilen, acht Karten. */
export const ORT_SPALTEN = 2;
export const ORT_ZEILEN = 4;
export const ORT_JE_BLATT = ORT_SPALTEN * ORT_ZEILEN;

/**
 * DIE KARTE LIEGT QUER, UND SIE IST EINE SPUR KLEINER ALS A7.
 *
 * Der bedruckbare Bereich ist 202 x 289 mm; geteilt durch das Raster ergibt das
 * 101 x 72,25 mm je Zelle. Die Karte nimmt davon 100 x 72 mm — das Spiel von
 * gut einem Millimeter je Richtung ist kein Schoenheitsmass, sondern der Grund,
 * warum die vierte Zeile nicht auf die naechste Seite faellt: Chromium rechnet
 * Millimeter in Pixel um, und eine Kachelung, die auf den Zehntelmillimeter
 * aufgeht, geht irgendwann NICHT auf. Gemessen mit echtem Chromium ueber
 * `page.pdf({ preferCSSPageSize: true })`: 8 Karten → 1 Seite, 9 → 2, 16 → 2,
 * 17 → 3, 24 → 3, 25 → 4.
 *
 * ⚠️ QUER UND NICHT HOCHKANT — das ist der Auftrag des Tickets. Eine hochkante
 * Karte (64 x 95 mm, der Stand bis DRK-388) laesst sich auf A4 nur viermal
 * unterbringen; erst die Querlage bringt acht auf das Blatt.
 *
 * ⚠️ 100 x 72 IST KEIN A7 (74 x 105 mm), UND DAS IST HINNEHMBAR: die Karte wird
 * ausgeschnitten und laminiert, und in eine A7-Laminiertasche muss sie ohnehin
 * kleiner hinein als das Nennmass, sonst schliesst die Naht nicht.
 */
export const ORT_KARTE_BREITE_MM = 100;
export const ORT_KARTE_HOEHE_MM = 72;

/**
 * DER QR — 46 mm, und das ist der eigentliche Zweck des Formats.
 *
 * Das Regaletikett traegt 20 mm auf 48,5 x 25,4 mm; das reicht fuer einen
 * Griff ins Regal, aus 20 cm Abstand. Eine Karte am Fahrzeug wird im Vorbeigehen
 * gescannt, mit einer Hand, oft in schlechtem Licht — mehr als das Doppelte an
 * Kantenlaenge ist genau der Unterschied, um den es im Ticket geht
 * („gut nutzbarer QR-Code").
 *
 * ⚠️ DIE ZAHL HAT DEN FORMATWECHSEL UEBERLEBT, UND ZWAR KNAPP. Auf der
 * Querkarte bleiben zwischen Beizeile und Fuss 48,5 mm Hoehe — der QR passt mit
 * gut zwei Millimetern Luft. Wer die Beizeile oder den Fuss um eine Zeile
 * wachsen laesst, nimmt sie ihm; dann schrumpft der QR still, denn `flex: none`
 * haelt nur den Umschlag, nicht das Blatt.
 */
export const ORT_QR_MM = 46;

/**
 * DIE ZEILEN, DIE DIE FUSSZEILE FEST BELEGT — und der Grund, warum die
 * Stufentabelle unten ueberhaupt gilt.
 *
 * ⚠️ FEST RESERVIERT, NICHT „so viele, wie gebraucht werden". Die Laenge der
 * Adresse haengt an `SUITE_HOST_LAGERBUCH`, also an der Konfiguration; waechst
 * sie um eine Zeile, schrumpfte der Namenskasten und jede gemessene Zahl unten
 * waere daneben.
 *
 * ⚠️ DREI ZEILEN TRAGEN AUF DER QUERKARTE MEHR ALS AUF DER HOCHKANTEN: der Fuss
 * laeuft ueber die volle Kartenbreite (92 mm statt 56 mm), gemessen rund 190
 * Zeichen statt 130. Das ist der eine Posten, den der Formatwechsel verschenkt
 * hat und den niemand vermisst — die Zeilenzahl bleibt trotzdem bei drei, weil
 * eine vierte dem Namen Hoehe naehme, die er auf 72 mm Karte dringender
 * braucht.
 */
export const ORT_FUSS_ZEILEN = 3;

/**
 * DIE ZEILEN DER BEIZEILE — die zweite feste Groesse, an der die Stufentabelle
 * haengt.
 *
 * ⚠️ AUS DEMSELBEN GRUND FEST WIE DIE FUSSZEILE, und der Ausloeser ist eine
 * andere unbegrenzte Angabe: `lagerorte.kennung` kennt keine Obergrenze
 * (`_actions/fahrzeuge.ts`: `z.string().trim().optional()`). Ohne Reservierung
 * wuchs sie mit der Kennung (gemessen auf der hochkanten Karte 13 → 26 → 39px)
 * und nahm dem Namen genau die Hoehe, gegen die seine Stufen gemessen sind; eine
 * Kennung ohne Trennstellen ragte seitlich aus der Karte.
 *
 * ⚠️ EINE ZEILE UND NICHT ZWEI: die zweite kostete JEDE Karte Namenshoehe,
 * dauerhaft, fuer einen seltenen Fall. Was nicht passt, endet sichtbar auf
 * „…", und abgeschnitten wird das Ende der Kennung, nie die Art: die steht
 * vorn.
 */
export const ORT_META_ZEILEN = 1;

/**
 * DIE SCHRIFTSTUFEN DES ORTSNAMENS — Codex-Befund P2 zu PR #177, neu vermessen
 * fuer die Querkarte (DRK-388).
 *
 * ⚠️ DIE KARTE SCHNITT DEN NAMEN EINMAL AB 24 ZEICHEN AB, UND ZWAR STILL. Das
 * ist kein Grenzfall: `createFahrzeug` kennt keine Obergrenze
 * (`_actions/fahrzeuge.ts`: nur `min(1)`), und schon der lokale Seed fuehrt
 * „Sanitätstasche 1" mit 16 Zeichen — ein Name wie „Rucksack Betreuung
 * Einsatzeinheit 3" ist voellig gewoehnlich. `overflow-wrap: anywhere` hilft
 * dagegen NICHT: es schafft Trennstellen, aber keinen Platz.
 *
 * ⚠️ DER FORMATWECHSEL HAT JEDE ZAHL DIESER TABELLE UNGUELTIG GEMACHT, UND ZWAR
 * IN BEIDE RICHTUNGEN. Das Namensfeld der hochkanten Karte war 56 mm breit und
 * 23 mm hoch; auf der Querkarte steht es NEBEN dem QR und ist 43 mm breit und
 * 48 mm hoch. Es traegt also mehr Zeichen (mehr Zeilen) und kuerzere Woerter
 * (weniger Breite) — wer nur die Hoehe nachgerechnet haette, bekaeme „Sanitäts-
 * / tasche 1" zurueck, den Fall, dessentwegen die Wortspalte ueberhaupt
 * existiert.
 *
 * ⚠️ JEDE ZAHL HIER IST GEMESSEN, KEINE GERECHNET (echtes Chromium, Druckmedium,
 * gegen die echte Karte auf der echten Seite; Namensfeld 161 x 181 px). Die
 * drei Spalten kommen aus drei verschiedenen Messungen, und das ist Absicht:
 *
 *   `zeilen`      volle Zeilen, die in das Feld passen — `floor(Hoehe /
 *                 Zeilenhoehe)`, gemessen 181/31, 181/24, 181/20, 181/17,
 *                 181/14. ⚠️ ABGERUNDET, NICHT AUFGERUNDET: eine Klammer, die
 *                 mehr Zeilen zulaesst als hineinpassen, laesst `overflow:
 *                 hidden` genau die Zeile abschneiden, auf der die
 *                 Auslassungspunkte stehen — der stille Schnitt waere zurueck,
 *                 und zwar ausgerechnet dort, wo die Klammer ihn verhindern
 *                 soll.
 *   `bisWort`     laengstes Wort auf EINER Zeile, gemessen an einem echten
 *                 deutschen Kompositum („Mannschaftstransportwagen…"), nicht an
 *                 einer Folge von „M". Das waere der breiteste denkbare, nicht
 *                 der breiteste WIRKLICHE Fall — und weil die Wortbedingung
 *                 ohnehin nur ein Wunsch ist (siehe `nameStufe`), kostete sie
 *                 dann jeden gewoehnlichen Namen zwei Stufen.
 *   `bisZeichen`  der SCHLECHTERE von zwei Faellen, und der erste ist der, den
 *                 man nicht sieht: Woerter, die gerade so nicht zu zweit auf
 *                 eine Zeile passen, lassen jede Zeile halb leer. Gemessen wird
 *                 deshalb ueber ALLE Wortlaengen und die schlechteste genommen
 *                 (bei 20pt sind das Woerter zu fuenf Zeichen, gemessen 39),
 *                 dagegen gehalten eine ununterbrochene Folge von „M"
 *                 (gemessen 36) — die Zeile im Feld ist dann die kleinere.
 *
 * ⚠️ DIE MESSREIHE GILT NUR, WEIL DER NAMENSPLATZ KONSTANT IST — und das ist er
 * nur, weil Beizeile UND Fusszeile eine FESTE Hoehe haben. Ohne sie haengt der
 * Platz an `SUITE_HOST_LAGERBUCH` und an `lagerorte.kennung`, und eine Tabelle,
 * die an einer Umgebungsvariablen haengt, ist keine Tabelle.
 *
 * ⚠️ UND DIE KLAMMER RETTET DAS NICHT: schrumpft der Kasten, bleibt die Klammer
 * bei ihrer festen Zeilenzahl, und `overflow: hidden` schneidet VOR der letzten
 * Zeile und damit VOR den Auslassungspunkten. Der stille Schnitt waere zurueck.
 * Die Klammer faengt, was auch bei konstantem Platz nicht passt; die festen
 * Hoehen halten den Platz konstant. Es braucht beides.
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
   * „Sanitätstasche" allein ist dort zu breit und brach als „Sanitätstasch /
   * e 1" um. Gemessen am breitesten realistischen Buchstabensatz
   * (Grossbuchstaben, „m"/„w"), nicht am guenstigsten.
   */
  bisWort: number;
  /** Zeilen, die bei diesem Grad in das Namensfeld passen — der Klammerwert. */
  zeilen: number;
};

export const NAME_STUFEN: readonly NameStufe[] = [
  { klasse: "lb-ortkarteNameXl", pt: 20, bisZeichen: 36, bisWort: 10, zeilen: 5 },
  { klasse: "lb-ortkarteNameL", pt: 16, bisZeichen: 61, bisWort: 13, zeilen: 7 },
  { klasse: "lb-ortkarteNameM", pt: 13, bisZeichen: 87, bisWort: 16, zeilen: 9 },
  { klasse: "lb-ortkarteNameS", pt: 11, bisZeichen: 118, bisWort: 19, zeilen: 10 },
  /**
   * ⚠️ DIE LETZTE STUFE IST NICHT „unendlich viel passt", sondern „hier hoert
   * das Verkleinern auf". Darueber greift die Klammer und der Name endet
   * sichtbar auf „…". Das ist der eigentliche Punkt der Stufen: ein
   * abgeschnittener Name ist hinnehmbar, ein STILL abgeschnittener nicht — auf
   * einem laminierten Kaertchen sieht niemand, dass da noch etwas stand.
   *
   * Weiter zu verkleinern waere eine Scheinloesung: unter 9pt ist ein Name auf
   * Armeslaenge nicht mehr zu lesen, und ein unlesbarer Name ist kein besserer
   * als ein gekuerzter.
   */
  { klasse: "lb-ortkarteNameXs", pt: 9, bisZeichen: null, bisWort: 23, zeilen: 12 },
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
 * Wortbedingung dann bis zur letzten Stufe durchschlagen, staende ein kurzer
 * Name in 9pt da, obwohl ein groesserer Grad ihn vollstaendig truege. Der Preis
 * waere falsch herum bezahlt: ein Mittenbruch ist haesslich, eine zu kleine
 * Schrift auf einem laminierten Kaertchen ist unbenutzbar.
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
