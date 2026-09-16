"use client";

import { mappe, type FertigesBlatt } from "./spalten";

/**
 * DER CLIENTSEITIGE AUSGABEWEG — eine `.xlsx` aus dem Browser heraus (DRK-186).
 *
 * ⛔ WARUM ES DIESE HÄLFTE ÜBERHAUPT NOCH GIBT, obwohl das Ticket den Weg über
 * einen Route Handler als den saubereren benennt: `lagerbuch`s Bestandsliste
 * exportiert GENAU DAS, WAS GERADE IN DER TABELLE STEHT — die Menge nach Suche
 * und Spaltenfiltern. Dieser Zustand lebt im Browser (Falle 15,
 * `core/tabelle/angezeigt.ts`); ein Route Handler kennt ihn nicht und lieferte
 * still die volle Liste. Der Client-Weg ist dort also eine fachliche
 * Entscheidung, keine Altlast — und das ist der Grund, warum der Baustein zwei
 * Hälften hat statt einer.
 *
 * ⚠️ DIE BIBLIOTHEK WIRD ERST BEIM KLICK GELADEN. Sie ist der größte Brocken,
 * den eine Verwaltungsseite sonst mitschleppte, und niemand, der eine Liste nur
 * ansieht, braucht sie. Der dynamische Import ist deshalb kein Stil, sondern
 * der Zweck dieser Funktion.
 */
export async function xlsxHerunterladen(
  dateiname: string,
  blaetter: readonly FertigesBlatt[],
): Promise<void> {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  await writeXlsxFile(mappe(blaetter)).toFile(dateiname);
}
