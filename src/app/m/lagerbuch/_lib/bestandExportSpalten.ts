import type { ExportSpalte } from "@/core/export";
import type { BestandExportZeile } from "./bestandExport";

/**
 * DIE ZEHN SPALTEN DES EXCEL-EXPORTS — kein "use client", und das ist der ganze
 * Zweck dieser Datei (Spec §9.4).
 *
 * FALLE 6 MIT VOLLER WUCHT: die Spaltenliste ist ein WERT und lebte im Bestand
 * in einem "use client"-Modul (../lagerbuch/.../ArtikelTable.tsx:89-99). Die
 * neun Ueberschriften sind 1:1-Pflicht 28 und gehoeren damit in einen Test, den
 * auch eine Server Component lesen koennen muss. Bleibt die Liste in der Insel,
 * bekommt eine Server Component eine Client-Referenz statt des Wertes: HTTP 500
 * fuer die ganze Seite, `typecheck` und `build` gruen, und Vitest kann es
 * strukturell nicht finden (CLAUDE.md:24-27).
 *
 * DIE ZEHNTE SPALTE, „Kategorie", ist KEINE 1:1-Pflicht, sondern DRK-294 — das
 * Alt-Format hatte sie nicht. Sie steht direkt hinter „Fach", weil beide
 * beschreiben, WAS und WO; die Zahlen dahinter behalten ihre Nachbarschaft.
 *
 * ⚠️ SEIT DRK-186 IST DAS DER SUITE-WEITE TYP `ExportSpalte`, nicht mehr ein
 * modul-eigener. Zwei Unterschiede, die beim Lesen auffallen:
 *
 *   `header`/`width`   heissen jetzt `kopf`/`breite` — der Baustein ist deutsch
 *                      benannt wie der Rest der Suite.
 *   `zahl?: boolean`   ist ERSATZLOS entfallen. Er entschied, ob die Zelle mit
 *                      `type: Number` oder `type: String` angelegt wird; der
 *                      Baustein liest das am Laufzeitwert ab. Das ist nicht nur
 *                      kuerzer, es schliesst eine Fehlerquelle: ein `zahl: true`
 *                      auf einer Textspalte ergab `Number("Stk.")`, also `NaN`
 *                      in der Mappe — typkorrekt und still.
 *
 * FALLE 7 TRIFFT DIESEN EXPORT NICHT — und der Grund gehoert aufgeschrieben,
 * damit ihn niemand spaeter „aufraeumt": ArtikelTable traegt "use client" in
 * Zeile 1, das Icon am Knopf laeuft dort. Wandert der Knopf jemals in eine
 * Server Component, ergibt der Icon-Import HTTP 500 BEIM IMPORT, nicht beim
 * Rendern — und "use client" auf der Icon-Datei behebt das nicht, es macht es
 * still (CLAUDE.md:28-41).
 *
 * ENTSCHEIDUNG 9-G, SEIT DRK-186 SUITE-WEIT: eine Formel-Neutralisierung
 * beruehrt diesen Pfad NICHT. Der Baustein legt jede Zelle mit `type: String`
 * als Textzelle an, nie als Formel; eine Neutralisierung hier waere eine
 * Formataenderung ohne Gegenwert.
 */

// Zahlen bleiben Zahlen (Excel darf damit rechnen/sortieren), alles andere ist
// Text; leere Zellen statt „–", damit Filter in Excel sauber greifen.
export const EXCEL_SPALTEN: readonly ExportSpalte<BestandExportZeile>[] = [
  { kopf: "Artikel",        breite: 34, wert: (z) => z.artikel },
  { kopf: "Fach",           breite: 12, wert: (z) => z.fach },
  { kopf: "Kategorie",      breite: 20, wert: (z) => z.kategorie },
  { kopf: "Bestand",        breite: 10, wert: (z) => z.bestand },
  { kopf: "Einheit",        breite: 10, wert: (z) => z.einheit },
  { kopf: "Mindestbestand", breite: 16, wert: (z) => z.mindestbestand },
  { kopf: "Status",         breite: 22, wert: (z) => z.status },
  { kopf: "Nächste Charge", breite: 18, wert: (z) => z.charge },
  { kopf: "Verfall",        breite: 11, wert: (z) => z.verfall },
  { kopf: "Hinweis",        breite: 20, wert: (z) => z.hinweis },
];

export const EXCEL_BLATTNAME = "Bestand Handlager";

/** Halbgeviertstrich U+2013, 1:1 aus ArtikelTable.tsx:144. Der Text erscheint am
 *  Knopf als Rueckgabewert, nie als `e.message` — der waere in Produktion der
 *  englische Satz ueber eine „server-side exception" (Falle 66, §11.2 d). */
export const EXCEL_FEHLERTEXT =
  "Excel-Datei konnte nicht erzeugt werden – bitte erneut versuchen.";
