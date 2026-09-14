/**
 * Reiner Stammdatenparser fuer Browser-Vorschau und Server Action.
 *
 * Das Trennzeichen gilt fuer das ganze Dokument. Semikolon hat auf der ersten
 * nichtleeren Zeile Vorrang, damit ein Komma in einem Semikolon-Feld Inhalt
 * bleibt und nicht versehentlich eine weitere Spalte erzeugt.
 *
 * DIE SECHSTE SPALTE IST OPTIONAL (DRK-294): die Kategorie. Fuenfspaltige
 * Dateien, wie es sie vor der Kategorie gab, laufen unveraendert durch — beide
 * Formen duerfen sogar im selben Dokument stehen. Eine leere Kategorie fehlt in
 * der Zeile ganz (`kategorie` ist dann nicht gesetzt), nie als Leerstring.
 */
import { KATEGORIE_MAX_LAENGE, kategorieNormalisieren } from "./kategorie";

export type CsvZeile = {
  name: string;
  einheit: string;
  fach: string;
  mindestbestand: number;
  startbestand: number;
  kategorie?: string;
};

type ParseErgebnis<T> = { rows: T[]; errors: string[] };
type InterneParseOptionen = { mitMetadaten: true };
type CsvZeileMitMetadaten = { row: CsvZeile; zeile: number };

const KOPFWORTE = ["name", "einheit", "fach", "mindestbestand", "startbestand"];
const KOPFWORT_KATEGORIE = "kategorie";

/**
 * Eine Kopfzeile ist es nur bei GENAU den fuenf Namen, optional gefolgt von
 * „Kategorie". Ein fremder sechster Kopf macht die Zeile zur Datenzeile, die in
 * der Mengenpruefung laut scheitert — sonst verschwaende eine Zeile still.
 */
function istKopfzeile(felder: string[]): boolean {
  if (!KOPFWORTE.every((wort, index) => felder[index]?.toLowerCase() === wort)) return false;
  if (felder.length === KOPFWORTE.length) return true;
  return felder.length === KOPFWORTE.length + 1
    && felder[KOPFWORTE.length]!.toLowerCase() === KOPFWORT_KATEGORIE;
}

export function parseArtikelCsv(text: string): ParseErgebnis<CsvZeile>;
export function parseArtikelCsv(
  text: string,
  optionen: InterneParseOptionen,
): ParseErgebnis<CsvZeileMitMetadaten>;
export function parseArtikelCsv(
  text: string,
  optionen?: InterneParseOptionen,
): ParseErgebnis<CsvZeile> | ParseErgebnis<CsvZeileMitMetadaten> {
  const rowsMitMetadaten: CsvZeileMitMetadaten[] = [];
  const errors: string[] = [];
  const zeilen = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n").split("\n");
  const ersteNichtleere = zeilen.find((zeile) => zeile.trim() !== "") ?? "";
  const trenner = ersteNichtleere.includes(";") ? ";" : ",";
  let ersteInhaltszeile = true;

  for (let i = 0; i < zeilen.length; i++) {
    const roh = zeilen[i]!.trim();
    if (!roh) continue;

    const felder = roh.split(trenner).map((feld) => feld.trim());
    if (ersteInhaltszeile) {
      ersteInhaltszeile = false;
      if (istKopfzeile(felder)) continue;
    }

    if (felder.length !== 5 && felder.length !== 6) {
      errors.push(
        `Zeile ${i + 1}: erwartet 5 oder 6 Spalten (Name, Einheit, Fach, Mindestbestand, Startbestand, optional Kategorie), gefunden ${felder.length}.`,
      );
      continue;
    }

    const [name, einheit, fach, minRoh, startRoh, kategorieRoh] = felder as [
      string,
      string,
      string,
      string,
      string,
      string | undefined,
    ];
    if (!name || !einheit || !fach) {
      errors.push(`Zeile ${i + 1}: Name, Einheit und Fach dürfen nicht leer sein.`);
      continue;
    }

    const mindestbestand = minRoh === "" ? Number.NaN : Number(minRoh);
    if (!Number.isInteger(mindestbestand) || mindestbestand < 0) {
      errors.push(`Zeile ${i + 1}: Mindestbestand „${minRoh}“ ist keine ganze Zahl ≥ 0.`);
      continue;
    }

    const startbestand = startRoh === "" ? Number.NaN : Number(startRoh);
    if (!Number.isInteger(startbestand) || startbestand < 0) {
      errors.push(`Zeile ${i + 1}: Startbestand „${startRoh}“ ist keine ganze Zahl ≥ 0.`);
      continue;
    }

    const kategorie = kategorieNormalisieren(kategorieRoh);
    if (kategorie !== null && kategorie.length > KATEGORIE_MAX_LAENGE) {
      errors.push(`Zeile ${i + 1}: Kategorie darf höchstens ${KATEGORIE_MAX_LAENGE} Zeichen haben.`);
      continue;
    }

    rowsMitMetadaten.push({
      row: {
        name, einheit, fach, mindestbestand, startbestand,
        ...(kategorie !== null ? { kategorie } : {}),
      },
      zeile: i + 1,
    });
  }

  if (optionen?.mitMetadaten) return { rows: rowsMitMetadaten, errors };
  return { rows: rowsMitMetadaten.map(({ row }) => row), errors };
}
