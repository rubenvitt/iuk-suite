import type { BestandExportZeile } from "./bestandExport";

/**
 * DIE NEUN SPALTEN DES EXCEL-EXPORTS — kein "use client", und das ist der ganze
 * Zweck dieser Datei (Spec §9.4).
 *
 * FALLE 6 MIT VOLLER WUCHT: EXCEL_SPALTEN ist ein WERT und lebt heute in einem
 * "use client"-Modul (../lagerbuch/.../ArtikelTable.tsx:89-99). Die neun
 * Ueberschriften sind 1:1-Pflicht 28 und gehoeren damit in einen Test, den auch
 * eine Server Component lesen koennen muss. Bleibt die Liste in der Insel,
 * bekommt eine Server Component eine Client-Referenz statt des Wertes: HTTP 500
 * fuer die ganze Seite, `typecheck` und `build` gruen, und Vitest kann es
 * strukturell nicht finden (CLAUDE.md:24-27).
 *
 * FALLE 7 TRIFFT DIESEN EXPORT NICHT — und der Grund gehoert aufgeschrieben,
 * damit ihn niemand spaeter „aufraeumt": ArtikelTable traegt "use client" in
 * Zeile 1, das Icon am Knopf laeuft dort. Wandert der Knopf jemals in eine
 * Server Component, ergibt der Icon-Import HTTP 500 BEIM IMPORT, nicht beim
 * Rendern — und "use client" auf der Icon-Datei behebt das nicht, es macht es
 * still (CLAUDE.md:28-41).
 *
 * ENTSCHEIDUNG 9-G: der Formelschutz aus _lib/csvZelle.ts beruehrt diesen Pfad
 * NICHT. `write-excel-file` legt jede Zelle mit `type: String` als Textzelle an,
 * nie als Formel; eine Neutralisierung hier waere eine Formataenderung ohne
 * Gegenwert.
 */

export type ExcelSpalte = {
  header: string;
  width: number;
  wert: (z: BestandExportZeile) => string | number;
  zahl?: boolean;
};

// Zahlen bleiben Zahlen (Excel darf damit rechnen/sortieren), alles andere ist
// Text; leere Zellen statt „–", damit Filter in Excel sauber greifen.
export const EXCEL_SPALTEN: readonly ExcelSpalte[] = [
  { header: "Artikel",        width: 34, wert: (z) => z.artikel },
  { header: "Fach",           width: 12, wert: (z) => z.fach },
  { header: "Bestand",        width: 10, wert: (z) => z.bestand, zahl: true },
  { header: "Einheit",        width: 10, wert: (z) => z.einheit },
  { header: "Mindestbestand", width: 16, wert: (z) => z.mindestbestand, zahl: true },
  { header: "Status",         width: 22, wert: (z) => z.status },
  { header: "Nächste Charge", width: 18, wert: (z) => z.charge },
  { header: "Verfall",        width: 11, wert: (z) => z.verfall },
  { header: "Hinweis",        width: 20, wert: (z) => z.hinweis },
] as const;

export const EXCEL_BLATTNAME = "Bestand Handlager";

/** Halbgeviertstrich U+2013, 1:1 aus ArtikelTable.tsx:144. Der Text erscheint am
 *  Knopf als Rueckgabewert, nie als `e.message` — der waere in Produktion der
 *  englische Satz ueber eine „server-side exception" (Falle 66, §11.2 d). */
export const EXCEL_FEHLERTEXT =
  "Excel-Datei konnte nicht erzeugt werden – bitte erneut versuchen.";
