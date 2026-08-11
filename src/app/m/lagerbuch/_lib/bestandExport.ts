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
 * DER DATEINAME WIRD IM BROWSER GEBILDET (ArtikelTable.tsx:142 uebergibt
 * `new Date()`), also aus der Zeitzone des ARBEITSPLATZES, nicht aus der des
 * Containers. Die TZ-Frage aendert an diesem Format daher nichts.
 *
 * WANDERT DIE BILDUNG JE AUF DEN SERVER, ist `heuteIso()` aus _lib/zeit.ts der
 * richtige Aufruf und NICHT diese lokalen Datumskomponenten (§9.4). Die Zeile
 * steht hier, damit die Umstellung dann eine Entscheidung ist und kein Versehen.
 */
export function bestandExportDateiname(now: Date): string {
  // Lokal aufgefuellt statt aus _lib/format.ts importiert: dessen Produces-Block
  // (Teil 3, T39) fuehrt `pad2` NICHT. Ein Import auf einen nicht zugesagten
  // Namen waere eine Wette, und ihn dort nachzutragen ein Eingriff in eine
  // fremde Datei fuer drei Zeichen.
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `bestand-${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}.xlsx`;
}
