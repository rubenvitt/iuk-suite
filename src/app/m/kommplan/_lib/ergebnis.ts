import type { Planangaben } from "./angaben";
import type { PlanInhalt } from "./plan/schema";

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
