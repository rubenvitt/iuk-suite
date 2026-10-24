// src/app/m/radio/_lib/csv/mappe.ts
// KEIN "use client" UND KEIN "use server" (Falle 6, `CLAUDE.md`); der Scan darueber steht in
// `src/app/m/radio/riegel.test.ts`, Abschnitt „keine Bauform-Direktive unter _lib/ und _db/".
//
// ⛔ DIE EXCEL-HAELFTE DES RUNDLAUFS (DRK-389): `baueExportBlatt` schreibt die Geraeteliste als
// Mappe, `lesEinMappe` liest eine Mappe zurueck in dieselbe Form, die der CSV-Leser liefert
// (Kopfzeile plus Rohzeilen aus Zeichenketten). Ab da laeuft alles ueber denselben Weg:
// automatische Spaltenzuordnung, `zeileZuEingehend`, Klassifikation.
//
// ⛔ SERVERSEITIG, UND DIESMAL GEMESSEN: `node:zlib` entpackt die Mappe (`core/export/lesen.ts`).
// Die Aufrufer sind der Export-Handler und der Hochladen-Handler — keine Client-Insel importiert
// diese Datei, und `ImportAssistent.test.tsx` haelt das fuer `einlesen.ts` fest, das hierher weiterreicht.
//
// ⛔ KEINE NEUE ABHAENGIGKEIT. `read-excel-file` waere das Gegenstueck zu `write-excel-file`;
// eine neue Abhaengigkeit ist aber eine Entscheidung, keine Nebenwirkung (dieselbe Linie wie
// `chardet`/`iconv-lite` in `einlesen.ts`). Der Leser hier kennt genau das, was eine Geraeteliste
// braucht: das ERSTE Blatt, Text, Zahlen, Wahrheitswerte und Datumszellen.
//
// Seit IDA-281 steht der Leser in `core/export/lesen.ts` (zweiter Nutzer: das Helferverzeichnis);
// hier wird er nur weitergereicht, damit `einlesen.ts` und die Tests ihren Importweg behalten.
import { blatt, type ExportSpalte as MappenSpalte, type FertigesBlatt } from "@/core/export/spalten";
import type { Geraet } from "../../_db/schema";
import { EXPORT_SPALTEN, formatiereZelle, type ExportFeld } from "./spalten";

export { istMappe, lesEinMappe, type EingeleseneMappe } from "@/core/export/lesen";

/** Der Name des einen Blattes der Exportmappe. */
export const EXPORT_BLATTNAME = "Funkgeräte";

/** Der Dateiname der Exportmappe; der Ausloeser in der Werkzeugleiste gibt keinen eigenen vor. */
export const EXPORT_DATEINAME = "funkgeraete-export.xlsx";

/**
 * Baut das eine Blatt der Exportmappe: die neunzehn Kopfzeilen aus `EXPORT_SPALTEN`, je Geraet
 * eine Zeile ueber `formatiereZelle`.
 *
 * ⛔ JEDE ZELLE IST TEXT, AUCH ISSI UND TEI. `formatiereZelle` liefert Zeichenketten, und
 * `blatt()` legt sie als Textzellen ab. Als Zahlzelle verloere eine TEI ihre fuehrende Null,
 * und eine 14-stellige Zahl zeigte Excel in Exponentialschreibweise — der Rundlauf braeche
 * still an genau dem Feld, an dem ein Geraet wiedererkannt wird.
 *
 * ⛔ DIESELBE FUNKTION FUER HANDLER UND RUNDLAUFTEST — eine zweite Zusammensetzung im Handler
 * waere ein zweiter Vertrag ohne zweiten Waechter.
 */
export function baueExportBlatt(geraete: readonly Pick<Geraet, ExportFeld>[]): FertigesBlatt {
  const spalten: MappenSpalte<Pick<Geraet, ExportFeld>>[] = EXPORT_SPALTEN.map((spalte) => ({
    kopf: spalte.kopf,
    wert: (geraet) => formatiereZelle(spalte.feld, geraet[spalte.feld]),
  }));
  return blatt(EXPORT_BLATTNAME, spalten, geraete);
}

