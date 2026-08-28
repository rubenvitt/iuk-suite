// src/app/m/radio/_lib/csv/spalten.ts
// KEIN "use client" UND KEIN "use server" (Falle 6, `CLAUDE.md`): `EXPORT_SPALTEN` und
// `tagAusWert` sind WERTE, die der Export-Handler (V22), die Import-Actions (V10) und die
// Client-Insel des Import-Assistenten (V18) lesen. Eine Direktive machte daraus in der einen
// Richtung eine Client-Referenz (HTTP 500 in einer Server Component), in der anderen eine
// Serverreferenz. Der Scan, der beide Richtungen fuer `_lib/` und `_db/` modulweit
// durchsetzt, steht in `src/app/m/radio/riegel.test.ts:909-962`.
//
// ⛔ DIESE DATEI ZIEHT NICHTS AUS `node:*`, AUS `_db/` ODER AUS EINER KODIERUNGSBIBLIOTHEK.
// Der einzige Import hier ist ein TYPimport (`import type`), der zur Laufzeit verschwindet —
// ein WERTimport aus `_db/` zoege Drizzle und `better-sqlite3` ins Browser-Bundle, und weder
// typecheck noch lint noch build saehen es.
//
// ⚠️ ZU `_lib/csv/einlesen.ts` IM SELBEN ORDNER: sie fasst als einzige des Ordners Bytes an,
// zieht aber HEUTE ebenfalls nichts Fremdes (gemessen: kein `import`, kein `node:`;
// `TextDecoder` und `Uint8Array` sind Web-Globals). Der frueher hier stehende Satz behauptete
// das Gegenteil und war ein Vorgriff. Die Grenze steht trotzdem schon jetzt — ⬜ A1
// (`chardet`/`iconv-lite`, Eigentuemer Betreiber) macht jene Datei serverseitig.
import type { Geraet } from "../../_db/schema";

/**
 * ⛔ ENTSCHEIDUNG E-V12 — DER CSV-EXPORT BEKOMMT KEINE FORMEL-NEUTRALISIERUNG.
 *
 * Der Hausbestand neutralisiert Formel-Injektion zentral: `neutralizeFormula` in
 * `src/app/m/feedback/_lib/csv.ts:17-22` setzt ein `'` vor jedes Feld, das mit `=`, `+`,
 * `-`, `@`, Tabulator oder CR beginnt. Hier steht sie bewusst NICHT. Drei Gruende, in dieser
 * Reihenfolge:
 *
 * 1. ⛔ SIE BRICHT DEN RUNDLAUF. Ein `'` vor einem Wert, der mit `-` beginnt, kommt beim
 *    Re-Import als TEIL DES WERTS zurueck — der Importer liest die Zelle woertlich
 *    (`radio-admin/server/src/import/commit-service.ts:106`, woertlich
 *    `out[field] = value === '' ? null : value`). Der Rundlauf ist die schriftlich gegebene
 *    Zusage dieses Wegs (`radio-admin/server/src/routes/export.ts:11-15`), die
 *    Neutralisierung ist es nicht.
 * 2. DAS RISIKOPROFIL IST EIN ANDERES ALS BEI `feedback`. Dort speist ANONYMER,
 *    OEFFENTLICHER Teilnehmer-Freitext den Export — `feedback/_lib/csv.ts:11-13` sagt das
 *    als Begruendung. Hier speisen ihn Geraetestammdaten, die nur Admins und Updater
 *    schreiben; der einzige anonyme Schreibpfad des Moduls ist `bucheAusleihe`
 *    (`_db/leihen.ts:504`), und `borrowerName` steht in KEINER der neunzehn Exportspalten.
 * 3. `buildCsv` waere ohnehin nicht wiederverwendbar: es joint hart mit `,`
 *    (`feedback/_lib/csv.ts:7`), der Vertrag verlangt `;`. Ein zweiter Parameter dort waere
 *    eine `core`-Aenderung fuer einen einzigen Aufrufer.
 *
 * ⬜ WENN EINE KUENFTIGE EXPORTSPALTE `borrower_name` TRAEGT, FAELLT DIESE ENTSCHEIDUNG.
 * Eigentuemer waere dann, wer die Spalte ergaenzt.
 */

/** Die neunzehn Felder, die der Export schreibt — die Schluessel der Geraetezeile. */
export type ExportFeld =
  | "issi"
  | "tei"
  | "rufname"
  | "serialNumber"
  | "deviceType"
  | "status"
  | "location"
  | "assignedTo"
  | "softwareVersion"
  | "lastUpdatedAt"
  | "notes"
  | "hiorgId"
  | "opta"
  | "funktion"
  | "hersteller"
  | "bedieneinheit"
  | "deviceModes"
  | "alamosIntegrated"
  | "loanable";

/** Eine Exportspalte: das Geraetefeld und seine deutsche Kopfzeile. */
export type ExportSpalte = { feld: ExportFeld; kopf: string };

/**
 * ⛔ DER RUNDLAUF-VERTRAG, 1:1 AUS `radio-admin/server/src/routes/export.ts:16-36` —
 * neunzehn Eintraege in FESTER Reihenfolge, deutsche Kopfzeilen.
 *
 * Der Alt-Kommentar (`export.ts:11-15`) ist die ganze Begruendung und steht hier woertlich:
 * „Export columns in fixed order: each German header MUST normalize (via autoMapHeaders)
 * back to its device field, so the exported file re-imports cleanly through the wizard.
 * Verified by exportRoundTrip test."
 *
 * ⛔ „Gerätefunktionen" TRAEGT SEINEN UMLAUT (`export.ts:33`). Er ist Bildschirmtext aus dem
 * Bestand, und die Global Constraints nehmen genau diesen Fall aus. Eine ASCII-Schreibung
 * liefe durch den Rundlauftest (die Praefixregel in `kopfzeilen.ts` akzeptiert beide
 * Zerlegungen) und braeche zugleich die 1:1-Treue gegen den echten Kundenkopf — gruen und
 * falsch.
 *
 * ⛔ WER HIER EINE SPALTE ERGAENZT, PRUEFT ZUERST `kopfzeilen.ts`: eine Kopfzeile ohne
 * Synonym bildet beim Re-Import auf NICHTS ab, und der Wert waere still verloren.
 */
export const EXPORT_SPALTEN: readonly ExportSpalte[] = [
  { feld: "issi", kopf: "ISSI" },
  { feld: "tei", kopf: "TEI" },
  { feld: "rufname", kopf: "Rufname" },
  { feld: "serialNumber", kopf: "Seriennummer" },
  { feld: "deviceType", kopf: "Typ" },
  { feld: "status", kopf: "Status" },
  { feld: "location", kopf: "Standort" },
  { feld: "assignedTo", kopf: "Zuordnung" },
  { feld: "softwareVersion", kopf: "Softwareversion" },
  { feld: "lastUpdatedAt", kopf: "Zuletzt aktualisiert" },
  { feld: "notes", kopf: "Notizen" },
  { feld: "hiorgId", kopf: "Hiorg-ID" },
  { feld: "opta", kopf: "OPTA" },
  { feld: "funktion", kopf: "Funktion" },
  { feld: "hersteller", kopf: "Hersteller" },
  { feld: "bedieneinheit", kopf: "Bedieneinheit" },
  { feld: "deviceModes", kopf: "Gerätefunktionen" },
  { feld: "alamosIntegrated", kopf: "Alamos" },
  { feld: "loanable", kopf: "Ausleihbar" },
] as const;

/**
 * ⛔ TRENNZEICHEN `;` (`export.ts:60`, `stringify(…, { delimiter: ';' })`) — deutsches Excel
 * oeffnet nur so ohne Zwischendialog.
 */
export const CSV_TRENNZEICHEN = ";";

/**
 * ⛔ FUEHRENDES UTF-8-BOM (`export.ts:9`, `:61`). Der Alt-Kommentar nennt den Grund:
 * „UTF-8 BOM so Excel opens the `;`-delimited file with correct encoding."
 */
export const CSV_BOM = "﻿";

/** Die Zone, in der ein Zeitpunkt zu einem Kalendertag wird — an genau einer Stelle. */
const ZONE = "Europe/Berlin";

/**
 * Der Kalendertag eines Zeitpunkts in `Europe/Berlin`, als `YYYY-MM-DD`.
 *
 * ⛔ DIE ZONE STEHT IM AUSDRUCK, NICHT IN DER UMGEBUNG. Das Repo setzt `TZ` ausdruecklich
 * NICHT (`_lib/anzeige.test.ts:25`); wer sich auf die Systemzone verliesse, baute einen
 * Wert, der auf dem Entwicklungsrechner richtig und im Container falsch ist. Dieselbe Form
 * wie `_lib/anzeige.ts:50`.
 *
 * ⛔ UEBER `formatToParts` UND NICHT UEBER `format`: die Reihenfolge, die ein Gebietsschema
 * ausgibt, ist kein Vertrag — `de-DE` liefert `TT.MM.JJJJ`, und ein Gebietsschema mit
 * `YYYY-MM-DD` zu waehlen hiesse, sich auf eine Nebenwirkung zu verlassen.
 */
function tagInBerlin(zeitpunkt: Date): string | null {
  if (Number.isNaN(zeitpunkt.getTime())) return null;
  const teile = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(zeitpunkt);
  const nimm = (art: string) => teile.find((t) => t.type === art)?.value ?? "";
  const jahr = nimm("year");
  const monat = nimm("month");
  const tag = nimm("day");
  if (jahr === "" || monat === "" || tag === "") return null;
  return `${jahr}-${monat}-${tag}`;
}

/**
 * Prueft einen Kalendertag und gibt ihn als `YYYY-MM-DD` zurueck, sonst `null`.
 *
 * ⛔ DER UEBERLAUF WIRD ABGELEHNT, 1:1 aus `commit-service.ts:58-66`: `Date.UTC(2026, 12, 32)`
 * ist gueltiges JS und rollt still in den naechsten Monat weiter. Wer das durchlaesst,
 * schreibt aus „32.13.2026" einen echt aussehenden Tag in die Datenbank.
 *
 * ⚠️ HIER RECHNET `Date.UTC` NUR ALS KALENDERPRUEFUNG, NICHT ALS ZEITZONENUMRECHNUNG — die
 * drei Zahlen sind bereits ein Kalendertag und werden als solcher zurueckgegeben.
 */
function kalendertag(jahr: number, monat: number, tag: number): string | null {
  const ms = Date.UTC(jahr, monat - 1, tag);
  if (!Number.isFinite(ms)) return null;
  const geprueft = new Date(ms);
  if (
    geprueft.getUTCFullYear() !== jahr ||
    geprueft.getUTCMonth() !== monat - 1 ||
    geprueft.getUTCDate() !== tag
  ) {
    return null;
  }
  const zweistellig = (zahl: number) => String(zahl).padStart(2, "0");
  return `${String(jahr).padStart(4, "0")}-${zweistellig(monat)}-${zweistellig(tag)}`;
}

/**
 * ⛔ DIE EINE TAGESUMRECHNUNG DES MODULS (Entscheidung E-V11 Punkt 4, `Spec:4739-4746`
 * zweite Zusage): das Geraeteformular (V14) und `formatiereZelle` lesen ihre Umrechnung aus
 * DIESER Funktion, nicht aus zweien.
 *
 * Sie nimmt die DREI Eingabeformen des Alt-Importers (`commit-service.ts:40-55`) und gibt
 * den Kalendertag zurueck, den die Suite-Spalte fuehrt (`_db/schema.ts:39`, `text`):
 *
 *   - eine Millisekundenzahl (auch als Zeichenkette) -> der Tag in `Europe/Berlin`
 *   - ISO `YYYY-MM-DD`                               -> derselbe Tag, geprueft
 *   - deutsch `DD.MM.YYYY`                           -> derselbe Tag, geprueft
 *   - ein `Date` (das Formular liefert es so)        -> der Tag in `Europe/Berlin`
 *   - leer / alles andere                            -> `null`, ⛔ NIE `NaN`
 *
 * ⛔ DIE MILLISEKUNDEN WERDEN IN `Europe/Berlin` GEKUERZT, NICHT IN UTC — und das ist die
 * benannte Abweichung vom Bestand. Der Alt-Import kuerzt in UTC (`commit-service.ts:48-53`,
 * `isoToUtcMs`), weil seine Spalte epoch-ms ist. `_db/schema.ts:36-38` entscheidet fuer die
 * Suite: „der Import kuerzt in Europe/Berlin, weil das fuer alle drei richtig ist und eine
 * UTC-Kuerzung nur fuer einen." Die drei gemeinten Wege sind CSV-Import (UTC-Mitternacht),
 * Formular (lokale Mitternacht) und Update-Karte (echte Uhrzeit, `UpdateDeviceCard.tsx:24`).
 *
 * ⛔ DIE ZWEI DATUMSFORMEN LAUFEN NICHT UEBER `Date` — sie SIND bereits Kalendertage. Ein
 * Umweg ueber `new Date("2026-08-24")` waere ECMA-262-UTC und ergaebe je nach Kuerzung
 * denselben Tag oder den Vortag; genau das ist der Posten, den ein „1:1"-Reflex hier kaputt
 * macht (E-V11 Punkt 3).
 */
export function tagAusWert(wert: unknown): string | null {
  if (wert === null || wert === undefined) return null;

  if (wert instanceof Date) return tagInBerlin(wert);

  if (typeof wert === "number") {
    return Number.isFinite(wert) ? tagInBerlin(new Date(wert)) : null;
  }

  if (typeof wert !== "string") return null;

  const roh = wert.trim();
  if (roh === "") return null;

  // Reine Millisekundenzahl (`commit-service.ts:44-47`).
  if (/^-?\d+$/.test(roh)) {
    const zahl = Number(roh);
    return Number.isFinite(zahl) ? tagInBerlin(new Date(zahl)) : null;
  }

  // ISO `YYYY-MM-DD` (`commit-service.ts:49-50`).
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(roh);
  if (iso) return kalendertag(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  // Deutsch `DD.MM.YYYY` (`commit-service.ts:52-53`).
  const deutsch = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(roh);
  if (deutsch) return kalendertag(Number(deutsch[3]), Number(deutsch[2]), Number(deutsch[1]));

  return null;
}

/**
 * Die Gegenrichtung: der gespeicherte Kalendertag als Zellinhalt.
 *
 * ⛔ HIER WIRD NICHT GERECHNET (Entscheidung E-V11 Punkt 3). Der Alt-Code tut an dieser
 * Stelle `new Date(value as number).toISOString().slice(0, 10)` (`export.ts:51`), weil seine
 * Spalte epoch-ms fuehrt. Die Suite-Spalte IST bereits die Zeichenkette `YYYY-MM-DD`
 * (`_db/schema.ts:39`) — jede Rechnung hier waere ein Umweg mit Zonenrisiko und ohne Gewinn.
 */
export function wertAusTag(tag: string | null | undefined): string {
  return tag === null || tag === undefined ? "" : tag;
}

/**
 * Formatiert ein Geraetefeld in seine CSV-Zelle — DREI Regeln, 1:1 aus `export.ts:45-54`.
 *
 * 1. `alamosIntegrated`/`loanable`: `true -> 'x'`, sonst `''` (`export.ts:46-48`).
 *    ⛔ NUR `true` UND `null` LAUFEN RUND, und der Alt-Kommentar benennt das ausdruecklich
 *    (`export.ts:40-41`): „only true and null round-trip; the importer reads '' as null".
 *    Ein `false` kommt als `null` zurueck. Das ist ein bekannter, gewollter Verlust; er ist
 *    in `rundlauf.test.ts` festgehalten statt verschwiegen.
 * 2. `lastUpdatedAt`: ueber `wertAusTag` — ⛔ ohne Rechnung, siehe dort.
 * 3. Alles andere: woertlich, `null -> ''` (`export.ts:53`).
 */
export function formatiereZelle(feld: ExportFeld, wert: unknown): string {
  if (feld === "alamosIntegrated" || feld === "loanable") {
    return wert === true ? "x" : "";
  }
  if (feld === "lastUpdatedAt") {
    return wertAusTag(wert as string | null);
  }
  return wert === null || wert === undefined ? "" : String(wert);
}

/**
 * Maskiert eine Zelle nach RFC 4180: nur wenn sie das Trennzeichen, ein Anfuehrungszeichen
 * oder einen Zeilenumbruch enthaelt, und dann mit verdoppelten Anfuehrungszeichen.
 *
 * ⬜ BENANNTE ABWEICHUNG, DENSELBEN GRUND WIE `einlesen.ts`: der Bestand nimmt dafuer
 * `csv-stringify` (`export.ts:2`), und das Paket ist im Repo gemessen NICHT vorhanden
 * (`grep -n "csv-stringify" package.json` ohne Treffer, 2026-08-25). Eine neue Abhaengigkeit
 * ist eine Entscheidung, keine Nebenwirkung — deshalb steht die Frage als Vermerk in der
 * Aufgabenrueckmeldung und hier der Nachbau der beiden Regeln, die der Vertrag braucht.
 * `feedback/_lib/csv.ts:24-30` ist NICHT wiederverwendbar: es joint hart mit `,` (`:7`) und
 * neutralisiert Formeln (`:17-22`), was E-V12 hier ausdruecklich ausschliesst.
 */
function maskiereZelle(zelle: string): string {
  if (zelle.includes(CSV_TRENNZEICHEN) || /["\r\n]/.test(zelle)) {
    return `"${zelle.replace(/"/g, '""')}"`;
  }
  return zelle;
}

/**
 * Baut den vollstaendigen CSV-Text (mit fuehrendem BOM) fuer die uebergebenen Geraete.
 *
 * 1:1 aus `export.ts:57-62`: Kopfzeile aus `EXPORT_SPALTEN`, je Geraet eine Zeile ueber
 * `formatiereZelle`, `;` als Trennzeichen, `\n` als Zeilenende (die Vorgabe von
 * `csv-stringify`, gemessen am Alt-Test `radio-admin/server/test/deviceTei.test.ts:76`, der
 * das Ergebnis an `'\n'` teilt), und ein Zeilenende auch nach der letzten Zeile.
 */
export function baueExportCsv(geraete: readonly Pick<Geraet, ExportFeld>[]): string {
  const kopfzeile = EXPORT_SPALTEN.map((spalte) => maskiereZelle(spalte.kopf)).join(CSV_TRENNZEICHEN);
  const zeilen = geraete.map((geraet) =>
    EXPORT_SPALTEN.map((spalte) => maskiereZelle(formatiereZelle(spalte.feld, geraet[spalte.feld]))).join(
      CSV_TRENNZEICHEN,
    ),
  );
  return `${CSV_BOM}${[kopfzeile, ...zeilen].join("\n")}\n`;
}
