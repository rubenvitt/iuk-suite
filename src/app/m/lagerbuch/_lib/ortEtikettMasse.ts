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
