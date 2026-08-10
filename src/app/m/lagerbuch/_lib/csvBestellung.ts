import { csvZelle, csvTextZelle } from "./csvZelle";

/**
 * DER VERTRAG `bestellvorschlag.csv` — kein "use client" (Falle 6).
 *
 * Das ist eine Datei mit einem Abnehmer AUSSERHALB des Repos. Sie ist deshalb
 * 1:1-Pflicht 28, und zwar in jedem Byte: sechs Koepfe in dieser Reihenfolge,
 * Semikolon, jede Zelle gequotet, `\n` statt CRLF, kein BOM, konstanter
 * Dateiname ohne Datum.
 *
 * WAS AUSDRUECKLICH NICHT "MIT REPARIERT" WIRD: das fehlende BOM und das `\n`.
 * Ein nachgeruestetes BOM kann einen Abnehmer stromabwaerts brechen, ohne dass
 * es im Modul sichtbar wird — und es verfehlte ausgerechnet die
 * Kopfzeilenerkennung des modul-eigenen Importers (./csv.ts:43-47, KOPFWORTE-
 * Vergleich). Ebenso unveraendert: der konstante Dateiname, obwohl wiederholte
 * Downloads im Download-Ordner kollidieren. Ein datierter Name waere eine
 * Verbesserung — und eine Formataenderung.
 */

export type BestellCsvZeile = {
  name: string; bestand: number; mindestbestand: number;
  vorschlag: number; einheit: string; bestellt: boolean;
};

/** 1:1-Pflicht 28: sechs Koepfe, diese Reihenfolge, deutsche Beschriftung.
 *  Exportiert, damit der Test gegen die Konstante prueft und nicht gegen eine
 *  zweite Abschrift derselben Liste. */
export const BESTELL_CSV_KOEPFE = [
  "Artikel", "Bestand", "Mindestbestand", "Vorschlag", "Einheit", "Status",
] as const;

export const BESTELL_CSV_DATEINAME = "bestellvorschlag.csv";

export function baueBestellCsv(zeilen: BestellCsvZeile[]): string {
  // Die Kopfzeile laeuft durch csvZelle, NICHT durch csvTextZelle: feste
  // Literale, ein Apostroph davor waere eine Formataenderung ohne Anlass.
  const kopf = BESTELL_CSV_KOEPFE.map(csvZelle).join(";");
  const reihen = zeilen.map((z) =>
    [
      csvTextZelle(z.name),
      csvZelle(z.bestand),
      csvZelle(z.mindestbestand),
      csvZelle(z.vorschlag),
      csvTextZelle(z.einheit),
      // `Status` ist ein Code-Literal und kann nie ein Praefix tragen — es laeuft
      // trotzdem durch csvTextZelle, damit die drei Textspalten EINE Regel haben.
      csvTextZelle(z.bestellt ? "bestellt" : "offen"),
    ].join(";"),
  );
  // "\n", nicht CRLF; kein BOM. Beides 1:1 aus BestellListe.tsx:31.
  return [kopf, ...reihen].join("\n");
}
