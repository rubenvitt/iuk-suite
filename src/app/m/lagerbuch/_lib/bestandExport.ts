import { datierterDateiname } from "@/core/export";

/**
 * Aufbereitung der Artikelliste fuer den Excel-Export. Bewusst frei von der
 * Excel-Bibliothek: hier entstehen nur die fertigen Zeilen (deutsche
 * Beschriftungen, flache Werte), die der Export-Knopf dann in Spalten giesst.
 * So bleibt die Logik testbar und der Client laedt die Bibliothek erst beim
 * Klick (§9.4, Entscheidung 9-E).
 *
 * KEIN "use client" — und diese Datei lag schon im Bestand richtig
 * (../lagerbuch/src/lib/bestand-export.ts). Falsch lag nur EXCEL_SPALTEN, und
 * die zieht _lib/bestandExportSpalten.ts heraus.
 */

export type BestandExportEingabe = {
  name: string;
  fach: string;
  kategorie: string | null;
  bestand: number;
  einheit: string;
  mindestbestand: number;
  aktiv: boolean;
  unterMindest: boolean;
  naechsteCharge: { chargenNr: string; verfall: string } | null;
  naechsteAblaufText: string | null;
};

export type BestandExportZeile = {
  artikel: string;
  fach: string;
  kategorie: string;
  bestand: number;
  einheit: string;
  mindestbestand: number;
  status: string;
  charge: string;
  verfall: string;
  hinweis: string;
};

/** Status wie in der Tabelle: inaktive Artikel zuerst, dann Mindestbestand,
 *  sonst „ok". Die Reihenfolge ist Fachlichkeit: ein inaktiver Artikel UNTER
 *  Mindestbestand heisst „inaktiv", nicht „unter Mindestbestand" — sonst stuende
 *  er in der Bestell-Auswertung. */
export function bestandStatus(
  row: Pick<BestandExportEingabe, "aktiv" | "unterMindest">,
): string {
  if (!row.aktiv) return "inaktiv";
  if (row.unterMindest) return "unter Mindestbestand";
  return "ok";
}

export function bestandExportZeilen(rows: BestandExportEingabe[]): BestandExportZeile[] {
  return rows.map((r) => ({
    artikel: r.name,
    fach: r.fach,
    // Leerstring statt „ohne Kategorie": dieselbe Regel wie Charge und Verfall.
    kategorie: r.kategorie ?? "",
    bestand: r.bestand,
    einheit: r.einheit,
    mindestbestand: r.mindestbestand,
    status: bestandStatus(r),
    // Leerstring statt „–": in Excel bleibt die Zelle so leer und stoert
    // Filter/Sortierung nicht.
    charge: r.naechsteCharge?.chargenNr ?? "",
    verfall: r.naechsteCharge?.verfall ?? "",
    hinweis: r.naechsteAblaufText ?? "",
  }));
}

/**
 * DER DATEINAME — seit DRK-186 aus dem gemeinsamen Baustein.
 *
 * ⛔ HIER STAND EINE LOKALE RECHNUNG AUS `getFullYear()/getMonth()/getDate()`,
 * also aus der Zone des ARBEITSPLATZES. Der alte Kommentar hielt das als
 * „heutiges Verhalten" fest und merkte an, eine Verlagerung auf den Server
 * muesse dann `heuteIso()` nehmen. DRK-186 beantwortet die Frage fuer die ganze
 * Suite und zwar in beide Richtungen: `datierterDateiname` rechnet in
 * `Europe/Berlin`, im Browser wie in einem Route Handler. Zwei stille Fehler
 * sind damit weg — derselbe Bestand von zwei Rechnern geladen hiess
 * unterschiedlich, und eine je serverseitig erzeugte Datei trueg um 00:30
 * Ortszeit den VORTAG im Namen.
 *
 * Das FORMAT ist unveraendert `bestand-JJJJ-MM-TT.xlsx`; die E2E prueft es
 * weiterhin gegen dieselbe Regex.
 */
export function bestandExportDateiname(now: Date): string {
  return datierterDateiname("bestand", now);
}
