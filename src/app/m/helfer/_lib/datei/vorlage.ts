/**
 * Die Vorlage für den Upload (IDA-281): ein leeres Blatt „Helfer“ mit den Spaltenköpfen und ein
 * zweites Blatt „Hinweise“ mit Erklärung und Beispiel je Spalte.
 *
 * Absichtlich OHNE Beispielzeile im ersten Blatt: gelesen wird nur das erste Blatt, und eine
 * vergessene Beispielperson käme sonst als echte Helferin ins Einsatzbuch.
 */
import { blatt, freiesBlatt, type FertigesBlatt } from "@/core/export/spalten";
import { DATEI_SPALTEN } from "./spalten";

export const VORLAGE_DATEINAME = "helfer-vorlage.xlsx";

export function vorlageBlaetter(): FertigesBlatt[] {
  return [
    blatt("Helfer", DATEI_SPALTEN.map((s) => ({ kopf: s.kopf, breite: Math.max(14, s.beispiel.length + 4), wert: () => null })), []),
    freiesBlatt("Hinweise", [
      ["Spalte", "Pflicht", "Hinweis", "Beispiel"],
      ...DATEI_SPALTEN.map((s) => [s.kopf, s.pflicht ? "ja" : "nein", s.hilfe, s.beispiel]),
      [],
      ["Gelesen wird nur das erste Blatt, und davon nur diese Spalten. Weitere Spalten (z. B. Telefon oder Anschrift) bleiben unbeachtet und werden nicht gespeichert."],
    ], [18, 9, 90, 30]),
  ];
}
