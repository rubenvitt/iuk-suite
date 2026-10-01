import type { Planangaben } from "./angaben";
import type { BibEinheit, BibStelle, BibVerbindung } from "./bibliothek/typen";
import type { PlanInhalt } from "./plan/schema";
import type { LogoTyp } from "./logo/logoTyp";
import type { KopieTitelArt } from "./tagesfassung";

/**
 * Rückgabetypen der Server Actions (`_actions/`). Hier und nicht in der Action-Datei: in einer
 * `"use server"`-Datei wäre jeder Export eine Action (Kopfkommentar `einsatzbuch/_lib/actionErgebnis.ts`).
 * Zurückgegeben statt geworfen, weil Next Fehlermeldungen aus Actions im Produktionsbau ersetzt.
 */
export type FeldFehler = Record<string, string>;
export interface Speicherstand { version: number; inhalt: PlanInhalt | null; angaben: Planangaben; aktualisiertAm: number; aktualisiertVon: string }
export type SpeicherErgebnis =
  | { ok: true; version: number; aktualisiertAm: number }
  | { ok: false; grund: "konflikt"; stand: Speicherstand }
  | { ok: false; grund: "weg" }
  | { ok: false; grund: "ungueltig"; fehler: string; feldFehler?: FeldFehler };
export type AnlageErgebnis = { ok: true; id: string } | { ok: false; fehler: string; feldFehler: FeldFehler };
/** Duplizieren: dazu, was mit dem Titel geschah — der Kopie-Hinweis bestätigt nur ein wirklich ersetztes Datum. */
export type DuplikatErgebnis = { ok: true; id: string; titel: KopieTitelArt } | { ok: false; fehler: string; feldFehler: FeldFehler };
/** Für Actions ohne eigenen Rückgabewert. Benannt, weil ein `{` in der Signatur den Riegel-Test der Actions bricht. */
export type EinfachErgebnis = { ok: true } | { ok: false; fehler: string };
export type LogoErgebnis = { ok: true; typ: LogoTyp } | { ok: false; fehler: string };
export type BibErgebnis<T> = { ok: true; eintrag: T } | { ok: false; fehler: string; feldFehler?: FeldFehler };
export type BibStelleErgebnis = BibErgebnis<BibStelle>;
export type BibEinheitErgebnis = BibErgebnis<BibEinheit>;
export type BibVerbindungErgebnis = BibErgebnis<BibVerbindung>;
export type ImportErgebnis<T = BibEinheit> = { ok: true; angelegt: number; uebersprungen: number; eintraege: T[] } | { ok: false; fehler: string };
export type VerbindungsImportErgebnis = ImportErgebnis<BibVerbindung>;
