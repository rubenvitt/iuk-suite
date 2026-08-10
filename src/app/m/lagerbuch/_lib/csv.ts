/**
 * Reiner Stammdatenparser fuer Browser-Vorschau und Server Action.
 *
 * Das Trennzeichen gilt fuer das ganze Dokument. Semikolon hat auf der ersten
 * nichtleeren Zeile Vorrang, damit ein Komma in einem Semikolon-Feld Inhalt
 * bleibt und nicht versehentlich eine sechste Spalte erzeugt.
 */
export type CsvZeile = {
  name: string;
  einheit: string;
  fach: string;
  mindestbestand: number;
  startbestand: number;
};

type ParseErgebnis<T> = { rows: T[]; errors: string[] };
type InterneParseOptionen = { mitMetadaten: true };
type CsvZeileMitMetadaten = { row: CsvZeile; zeile: number };

const KOPFWORTE = ["name", "einheit", "fach", "mindestbestand", "startbestand"];

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
  const zeilen = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");
  const ersteNichtleere = zeilen.find((zeile) => zeile.trim() !== "") ?? "";
  const trenner = ersteNichtleere.includes(";") ? ";" : ",";
  let ersteInhaltszeile = true;

  for (let i = 0; i < zeilen.length; i++) {
    const roh = zeilen[i]!.trim();
    if (!roh) continue;

    const felder = roh.split(trenner).map((feld) => feld.trim());
    if (ersteInhaltszeile) {
      ersteInhaltszeile = false;
      if (KOPFWORTE.every((wort, index) => felder[index]?.toLowerCase() === wort)) {
        continue;
      }
    }

    if (felder.length !== 5) {
      errors.push(
        `Zeile ${i + 1}: erwartet 5 Spalten (Name, Einheit, Fach, Mindestbestand, Startbestand), gefunden ${felder.length}.`,
      );
      continue;
    }

    const [name, einheit, fach, minRoh, startRoh] = felder as [
      string,
      string,
      string,
      string,
      string,
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

    rowsMitMetadaten.push({
      row: { name, einheit, fach, mindestbestand, startbestand },
      zeile: i + 1,
    });
  }

  if (optionen?.mitMetadaten) return { rows: rowsMitMetadaten, errors };
  return { rows: rowsMitMetadaten.map(({ row }) => row), errors };
}
