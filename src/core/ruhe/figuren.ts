/**
 * WELCHE HAARLINIEN-FIGUR WO STEHT — die eine Stelle (IDA-347, Etappe 3).
 *
 * Figuren aus `@lucasmarkes/hairline` (MIT) stehen NUR in Ruhezuständen: eine leere Liste, die
 * Anmeldung, „kein Zugriff", „nicht gefunden", das Portal ohne Angeheftetes und ein erledigter
 * Moment. Nie in Tabellen, Formularen, Flyins oder Einsatzansichten (Betreiberentscheidung
 * 2026-11-04).
 *
 * Der Aufrufer nennt einen SCHLÜSSEL (Modul oder Lage), nie eine Komponente: ein Wert aus einem
 * `"use client"`-Modul käme in einer Server Component als Client-Referenz an (Falle 6). Deshalb
 * trägt diese Datei keine Direktive und kein React.
 */

/** Die Figuren, die die Suite benutzt — je eine Datei unter `figuren/` (Name = Exportname im Paket). */
export const FIGUREN = [
  "basket",
  "cabinet",
  "dish",
  "drawer",
  "format",
  "hub",
  "keyboard",
  "lockers",
  "padlock",
  "plot",
  "plug",
  "query",
  "rail",
  "relay",
  "router",
  "settle",
  "slow",
  "stack",
  "terminal",
  "terrain",
] as const;

export type Figur = (typeof FIGUREN)[number];

/** Eine Figur je Modul, nach dem Gegenstand des Moduls. */
export const MODUL_FIGUR = {
  lagerbuch: "drawer", // Schubladen, leer bis auf die Trenner
  verpflegung: "basket", // ein leerer Korb
  wartung: "lockers", // Spinde, einer steht offen
  radio: "router", // Antennen
  files: "cabinet", // ein Ablageschrank
  feedback: "plot", // ein Balkendiagramm ohne Daten
  aufgaben: "stack", // ein Stapel
  einsatzbuch: "terminal", // Zeilen eines Protokolls
  kommplan: "relay", // ein Weg Knoten für Knoten
  helfer: "terrain", // viele, die sich heben
  fahrzeuge: "slow", // Kisten auf dem Band
  schichtplan: "keyboard", // ein Raster wie ein Kalender
  gemeinschaft: "settle", // Kacheln finden zusammen
  unterkunft: "rail", // eine Kleiderstange mit leeren Bügeln
  portal: "hub", // Kacheln um eine Mitte
} as const satisfies Record<string, Figur>;

/** Ruhezustände, die keinem Modul gehören. */
export const LAGE_FIGUR = {
  anmeldung: "dish",
  zugriff: "padlock",
  fehlt: "query",
  erledigt: "format", // jede Zeile rückt gerade
  stoerung: "plug", // ein gezogener Stecker: der Fehler liegt nicht bei der Person
} as const satisfies Record<string, Figur>;

export type RuheSchluessel = keyof typeof MODUL_FIGUR | keyof typeof LAGE_FIGUR;

const ALLE: Record<RuheSchluessel, Figur> = { ...MODUL_FIGUR, ...LAGE_FIGUR };

export function figurFuer(schluessel: RuheSchluessel): Figur {
  return ALLE[schluessel];
}
