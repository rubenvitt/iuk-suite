import type { ExportSpalte } from "@/core/export";

/**
 * DIE SPALTEN DER BEIDEN UAV-AUSWERTUNGEN (DRK-186).
 *
 * KEIN "use client" (Falle 6): die Listen sind WERTE und werden von Route
 * Handlern gelesen. Sie stehen hier und nicht in den Handlern, damit der
 * Spaltenvertrag ohne Datenbank und ohne Riegel prüfbar ist (`export.test.ts`).
 *
 * ⛔ WAS SICH GEGENÜBER DEM CSV-WEG ÄNDERT UND WARUM. Die Alt-Ausgabe schrieb
 * JEDEN Wert als Zeichenkette (`String(z.erledigt)`), weil eine CSV nichts
 * anderes kann. In einer Kalkulation ist das der Unterschied zwischen einer
 * Spalte, die man summieren und sortieren kann, und einer, bei der „10" vor
 * „9" steht. Zahlen sind hier deshalb Zahlen.
 *
 * ⚠️ DIE QUOTE HEISST JETZT „Quote %" UND TRÄGT EINE ZAHL. Vorher stand dort
 * `85%` als Text — in einer Kalkulation weder rechenbar noch sortierbar. Ohne
 * das Prozentzeichen im KOPF wäre die nackte 85 zweideutig (85 % oder 0,85?),
 * deshalb wandert es dorthin. Ein echtes Prozentformat auf der Zelle wäre die
 * dritte Möglichkeit und verlangte ein Zahlenformat im Baustein — das ist ein
 * eigener Posten, keine Nebenwirkung dieses Tickets.
 */

export type UebersichtZeile = {
  name: string;
  beginn: string | null;
  erledigt: number;
  gesamt: number;
  quoteProzent: number;
  letzteAktivitaet: string | null;
  aktiv: boolean;
};

export const UEBERSICHT_SPALTEN: readonly ExportSpalte<UebersichtZeile>[] = [
  { kopf: "Name", breite: 28, wert: (z) => z.name },
  { kopf: "Beginn", breite: 12, wert: (z) => z.beginn },
  { kopf: "Erledigt", breite: 10, wert: (z) => z.erledigt },
  { kopf: "Gesamt", breite: 10, wert: (z) => z.gesamt },
  { kopf: "Quote %", breite: 10, wert: (z) => z.quoteProzent },
  { kopf: "Letzte Aktivität", breite: 18, wert: (z) => z.letzteAktivitaet },
  { kopf: "Status", breite: 12, wert: (z) => (z.aktiv ? "aktiv" : "inaktiv") },
];

export const UEBERSICHT_BLATT = "Teilnehmer";
export const UEBERSICHT_DATEINAME = "teilnehmer-uebersicht.xlsx";

export type AufgabenZeile = {
  teil: number;
  nummer: string;
  titel: string;
  anzahl: number;
  ziel: number;
  erledigt: boolean;
  nichtAnwendbar: boolean;
  letzteDurchfuehrung: string | null;
};

/**
 * ⚠️ „Erledigt" UND „NichtAnwendbar" BLEIBEN „ja"/„nein" UND WERDEN NICHT ZU
 * WAHRHEITSWERTEN. `write-excel-file` schriebe einen Wahrheitswert als
 * `TRUE`/`FALSE` — in einer deutschsprachigen Kalkulation erscheint das je nach
 * Gebietsschema als `WAHR`/`FALSCH`, in einer englischen als `TRUE`. Dieselbe
 * Datei läse sich auf zwei Rechnern verschieden; `ja`/`nein` liest sich überall
 * gleich und ist die Form, die der Bestand schon hatte.
 */
export const AUFGABEN_SPALTEN: readonly ExportSpalte<AufgabenZeile>[] = [
  { kopf: "Teil", breite: 8, wert: (z) => z.teil },
  { kopf: "Nummer", breite: 10, wert: (z) => z.nummer },
  { kopf: "Titel", breite: 48, wert: (z) => z.titel },
  { kopf: "Anzahl", breite: 10, wert: (z) => z.anzahl },
  { kopf: "Ziel", breite: 8, wert: (z) => z.ziel },
  { kopf: "Erledigt", breite: 10, wert: (z) => (z.erledigt ? "ja" : "nein") },
  { kopf: "Nicht anwendbar", breite: 16, wert: (z) => (z.nichtAnwendbar ? "ja" : "nein") },
  { kopf: "Letzte Durchführung", breite: 20, wert: (z) => z.letzteDurchfuehrung },
];

export const AUFGABEN_BLATT = "Aufgaben";
