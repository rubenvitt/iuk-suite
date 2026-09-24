/**
 * CSV-Import der Stammdaten: reine Funktionen ohne Node-API, damit dieses Modul auch in der
 * Browser-Vorschau (Client-Insel) läuft. `import.ts` (Server) schreibt anhand des hier
 * erzeugten Plans (Spec §5.1, Entscheidung 7 im gemeinsamen Kontext).
 */
import { fahrzeugEingabe, personEingabe, stichwortEingabe } from "./schemas";
import type { FahrzeugDTO, PersonDTO, Stammdatenart, StichwortDTO } from "./typen";

export const KOPFZEILEN: Record<Stammdatenart, readonly string[]> = {
  fahrzeuge: ["typ", "kennung", "ruf", "standort"],
  personal: ["name", "quali", "ov"],
  stichworte: ["gruppe", "name", "reihenfolge"],
};
export const MAX_CSV_ZEICHEN = 512 * 1024;
export const MAX_CSV_ZEILEN = 2000;

export type Importklasse = "neu" | "geaendert" | "unveraendert" | "fehler";
export interface Vorschauzeile {
  zeile: number;
  klasse: Importklasse;
  werte: Record<string, string>;
  fehler?: string;
  id?: string;
}
export type Importplan = { ok: true; art: Stammdatenart; zeilen: Vorschauzeile[] } | { ok: false; fehler: string };
export interface Importbestand {
  fahrzeuge: FahrzeugDTO[];
  personal: PersonDTO[];
  stichworte: StichwortDTO[];
}

/** Excel unter Windows speichert CSV als Windows-1252; ohne Rückfall würden aus „Jürgens“ Ersatzzeichen. */
export function dekodiere(bytes: Uint8Array): string {
  const ohneBom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? bytes.subarray(3) : bytes;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(ohneBom);
  } catch {
    return new TextDecoder("windows-1252").decode(ohneBom);
  }
}

/** RFC 4180: Felder in Anführungszeichen dürfen Trennzeichen, Zeilenumbrüche und verdoppelte Anführungszeichen enthalten. */
export function parseCsv(text: string): string[][] {
  const ohneBom = text.startsWith("﻿") ? text.slice(1) : text;
  const ersteZeile = ohneBom.split(/\r?\n/, 1)[0] ?? "";
  const trenner = ersteZeile.includes(";") ? ";" : ersteZeile.includes("\t") ? "\t" : ",";
  const zeilen: string[][] = [];
  let feld = "";
  let zeile: string[] = [];
  let inAnf = false;
  for (let i = 0; i < ohneBom.length; i++) {
    const c = ohneBom[i];
    if (inAnf) {
      if (c === '"' && ohneBom[i + 1] === '"') {
        feld += '"';
        i++;
      } else if (c === '"') {
        inAnf = false;
      } else {
        feld += c;
      }
    } else if (c === '"' && feld === "") {
      inAnf = true;
    } else if (c === trenner) {
      zeile.push(feld);
      feld = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && ohneBom[i + 1] === "\n") i++;
      zeile.push(feld);
      feld = "";
      if (zeile.some((f) => f.trim() !== "")) zeilen.push(zeile);
      zeile = [];
    } else {
      feld += c;
    }
  }
  zeile.push(feld);
  if (zeile.some((f) => f.trim() !== "")) zeilen.push(zeile);
  return zeilen;
}

const SCHEMA = { fahrzeuge: fahrzeugEingabe, personal: personEingabe, stichworte: stichwortEingabe } as const;
const SCHLUESSEL: Record<Stammdatenart, "kennung" | "name"> = { fahrzeuge: "kennung", personal: "name", stichworte: "name" };
const SCHLUESSEL_TEXT: Record<Stammdatenart, string> = { fahrzeuge: "Kennung", personal: "Name", stichworte: "Stichwort" };

/**
 * Vorschau/Probelauf: prüft und klassifiziert jede Zeile, schreibt aber nichts. Der Abgleich
 * mit dem Bestand läuft über den fachlichen Schlüssel (`kennung` bzw. `name`); bei Personal
 * kann derselbe Name mehrfach vorkommen — das wird zur Fehlerzeile „mehrdeutig“, nie zu einer
 * stillen Auswahl.
 */
export function planeImport(art: Stammdatenart, text: string, bestand: Importbestand): Importplan {
  if (text.length > MAX_CSV_ZEICHEN) return { ok: false, fehler: "Die Datei ist größer als 512 KB." };
  const roh = parseCsv(text);
  if (roh.length === 0) return { ok: false, fehler: "Die Datei ist leer." };
  const kopf = KOPFZEILEN[art];
  if (roh[0].map((s) => s.trim().toLowerCase()).join(";") !== kopf.join(";")) {
    return { ok: false, fehler: `Die Kopfzeile muss genau „${kopf.join(";")}“ lauten.` };
  }
  if (roh.length - 1 > MAX_CSV_ZEILEN) return { ok: false, fehler: `Höchstens ${MAX_CSV_ZEILEN} Zeilen je Import.` };

  // Der fachliche Schlüssel (`kennung`/`name`) ist je nach Art auf einem anderen DTO-Feld zu
  // finden; die Tabellenweiche macht das hier unvermeidlich generisch (siehe Bericht).
  const vorhanden = bestand[art] as (FahrzeugDTO | PersonDTO | StichwortDTO)[];
  const gesehen = new Map<string, number>();
  const zeilen = roh.slice(1).map((felder, i): Vorschauzeile => {
    const zeile = i + 2;
    const werte = Object.fromEntries(kopf.map((k, j) => [k, (felder[j] ?? "").trim()]));
    if (felder.length !== kopf.length) {
      return { zeile, klasse: "fehler", werte, fehler: `${kopf.length} Spalten erwartet, ${felder.length} gefunden` };
    }
    const eingabe = {
      ...werte,
      ...(art === "stichworte" ? { reihenfolge: /^\d+$/.test(werte.reihenfolge) ? Number(werte.reihenfolge) : NaN } : {}),
      aktiv: true,
    };
    const geprueft = SCHEMA[art].safeParse(eingabe);
    if (!geprueft.success) return { zeile, klasse: "fehler", werte, fehler: geprueft.error.issues[0]?.message ?? "ungültig" };
    const daten = geprueft.data as Record<string, unknown>;
    const schluessel = String(daten[SCHLUESSEL[art]]);
    const frueher = gesehen.get(schluessel);
    if (frueher !== undefined) return { zeile, klasse: "fehler", werte, fehler: `${SCHLUESSEL_TEXT[art]} steht schon in Zeile ${frueher}` };
    gesehen.set(schluessel, zeile);
    const treffer = vorhanden.filter((v) => (v as unknown as Record<string, unknown>)[SCHLUESSEL[art]] === schluessel);
    if (treffer.length > 1) return { zeile, klasse: "fehler", werte, fehler: `mehrdeutig: ${treffer.length} Personen heißen so` };
    if (treffer.length === 0) return { zeile, klasse: "neu", werte };
    const alt = treffer[0] as unknown as Record<string, unknown>;
    const gleich = Object.entries(daten).every(([k, v]) => alt[k] === v);
    return { zeile, klasse: gleich ? "unveraendert" : "geaendert", werte, id: String(alt.id) };
  });
  return { ok: true, art, zeilen };
}
