/**
 * Die Spalten einer Helferliste als Excel-Datei (IDA-281) — die eine Stelle, die Leser, Vorlage und
 * Hilfetext teilen. Kein `"use client"` und keine Node-API: die Insel zeigt dieselbe Liste an.
 *
 * DIE ALLOWLIST IST DER DATENSCHUTZ, wie bei HiOrg (`../hiorg/person.ts`): gelesen werden nur diese
 * Spalten. Steht in der Datei mehr (Geburtsdatum, Anschrift, Telefon …), verlässt es den Leser nicht —
 * nur der Spaltenkopf wird genannt, damit die Verwaltende sieht, was liegen bleibt.
 *
 * Erkannt wird ein Kopf ohne Groß-/Kleinschreibung, Leerraum, Satzzeichen und Sternchen; „Ä“ zählt wie
 * „ae“. Jede Spalte hat einige gängige Schreibweisen aus anderen Listen.
 */
export type DateiFeld = "kennung" | "vorname" | "nachname" | "status" | "austritt" | "gruppen" | "qualifikationen";

export interface DateiSpalte {
  feld: DateiFeld;
  /** Der Kopf in der Vorlage. */
  kopf: string;
  pflicht: boolean;
  /** Weitere erkannte Köpfe, schon normalisiert (`normalisiereKopf`). */
  auch: readonly string[];
  /** Ein Satz für die Hilfe neben dem Upload. */
  hilfe: string;
  /** Die Beispielzeile der Vorlage. */
  beispiel: string;
}

export const DATEI_SPALTEN: readonly DateiSpalte[] = [
  {
    feld: "kennung", kopf: "Kennung", pflicht: false, auch: ["id", "nr", "nummer", "personalnummer", "mitgliedsnummer", "mitgliedsnr", "personalnr"],
    hilfe: "Eine feste Nummer je Person, z. B. die Mitgliedsnummer. Ohne sie erkennt die Suite eine Person am Namen wieder — wer umbenannt wird, gilt dann als gelöscht und neu.",
    beispiel: "1001",
  },
  { feld: "vorname", kopf: "Vorname", pflicht: true, auch: [], hilfe: "Pflicht.", beispiel: "Jana" },
  { feld: "nachname", kopf: "Nachname", pflicht: true, auch: ["familienname"], hilfe: "Pflicht.", beispiel: "Albers" },
  {
    feld: "status", kopf: "Status", pflicht: false, auch: ["kontostatus"],
    hilfe: "aktiv, eingeschränkt, extern oder gesperrt. Leer heißt aktiv.",
    beispiel: "aktiv",
  },
  {
    feld: "austritt", kopf: "Austritt", pflicht: false, auch: ["austrittsdatum", "ausgetretenam"],
    hilfe: "Datum des Austritts. Wer heute oder früher ausgetreten ist, kommt nicht in die Suite.",
    beispiel: "",
  },
  {
    feld: "gruppen", kopf: "Gruppen", pflicht: false, auch: ["gruppe"],
    hilfe: "Mehrere durch Komma oder Semikolon getrennt.",
    beispiel: "Bereitschaft, Sanitätsdienst",
  },
  {
    feld: "qualifikationen", kopf: "Qualifikationen", pflicht: false, auch: ["qualifikation", "qualis", "quali"],
    hilfe: "Mehrere durch Komma oder Semikolon getrennt, die Kurzform in Klammern, z. B. „Rettungssanitäter (RS)“. Das Einsatzbuch ordnet sie wie die aus HiOrg zu.",
    beispiel: "Rettungssanitäter (RS)",
  },
];

/** `" Nach-Name* "` → `nachname`; `Qualifikationen` → `qualifikationen`; `Ä` → `ae`. */
export function normalisiereKopf(kopf: string): string {
  return kopf
    .toLocaleLowerCase("de")
    .replaceAll("ä", "ae").replaceAll("ö", "oe").replaceAll("ü", "ue").replaceAll("ß", "ss")
    .replace(/[^a-z0-9]/g, "");
}

/** Das Feld zu einem Spaltenkopf, oder `null` für eine Spalte, die nicht gelesen wird. */
export function feldFuerKopf(kopf: string): DateiFeld | null {
  const n = normalisiereKopf(kopf);
  if (n === "") return null;
  return DATEI_SPALTEN.find((s) => normalisiereKopf(s.kopf) === n || s.auch.includes(n))?.feld ?? null;
}
