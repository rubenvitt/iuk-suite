import type { SymbolSpec } from "@einsatzzeichen/schema";

import { falte } from "./falte";
import generat from "./katalog.generiert.json";

/*
 * DIE NAHT zwischen dem Paket und diesem Modul. Sie liest ausschliesslich das
 * eingecheckte Generat und wird von Server Components UND von der Katalog-Insel
 * benutzt — deshalb genau EIN Codepfad fuers Suchen, und deshalb kein "use client"
 * (Falle 6: ein Wert aus einem als Client markierten Modul kaeme in einer Server
 * Component nicht an, HTTP 500 fuer die ganze Seite).
 *
 * Der Typimport aus @einsatzzeichen/schema ist rein — er verschwindet im Build und
 * zieht keinen Katalog-Code in den Server-Graph. `naht.test.ts` zaehlt ihn deshalb
 * nicht als Katalog-Import.
 */

export type ZeichenId = string;

export interface Zeichen {
  id: ZeichenId;
  titel: string;
  /** Der Quiz-Antworttext. Bei Titelkollision mit der Organisation qualifiziert. */
  antwort: string;
  mehrdeutigerTitel: boolean;
  abschnitt: string;
  kapitel: string;
  grundform: string | null;
  organisation: string | null;
  staerke: string | null;
  bedeutung: string;
  suchtext: string;
  svg: string;
  spec: SymbolSpec | null;
  specKanon: string | null;
  zweiteDarstellung?: { id: ZeichenId; abschnitt: string; svg: string };
  reviewNotiz: string | null;
}

export interface Filter {
  text?: string;
  kapitel?: string;
  organisation?: string;
  grundform?: string;
  /** Einschraenkung auf eine ID-Liste — so filtert ein Lernset den Bestand. */
  nur?: readonly ZeichenId[];
}

export const KATALOG_STAND: {
  paket: string;
  daten: string;
  anzahl: number;
  erzeugtAm: string;
} = generat.stand;

const ALLE = generat.zeichen as unknown as readonly Zeichen[];
const NACH_ID = new Map(ALLE.map((z) => [z.id, z]));

export function alleZeichen(): readonly Zeichen[] {
  return ALLE;
}

/**
 * Gibt `null` zurueck und WIRFT NIE. Gespeicherte Merkzeilen, Lernstaende und
 * Lernset-Eintraege zeigen auf Katalog-IDs, die ein Paketupgrade entfernt haben kann —
 * das ist ein Zustand, den die Oberflaeche zeigt (Spec §4.6 Stufe 2), kein Fehler,
 * der eine Seite zerlegt.
 */
export function findeZeichen(id: string): Zeichen | null {
  return NACH_ID.get(id) ?? null;
}

export function sucheZeichen(f: Filter): { treffer: readonly Zeichen[]; gesamt: number } {
  const nur = f.nur ? new Set(f.nur) : null;
  const worte = f.text ? falte(f.text).split(" ").filter(Boolean) : [];
  const treffer = ALLE.filter((z) => {
    if (nur && !nur.has(z.id)) return false;
    if (f.kapitel && z.kapitel !== f.kapitel) return false;
    if (f.organisation && z.organisation !== f.organisation) return false;
    if (f.grundform && z.grundform !== f.grundform) return false;
    return worte.every((w) => z.suchtext.includes(w));
  });
  return { treffer, gesamt: ALLE.length };
}

export function kapitelListe(): readonly { name: string; anzahl: number }[] {
  const zaehler = new Map<string, number>();
  for (const z of ALLE) zaehler.set(z.kapitel, (zaehler.get(z.kapitel) ?? 0) + 1);
  return [...zaehler.entries()]
    .map(([name, anzahl]) => ({ name, anzahl }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const eindeutig = (werte: (string | null)[]) =>
  [...new Set(werte.filter((w): w is string => w !== null))].sort((a, b) => a.localeCompare(b));

export function organisationen(): readonly string[] {
  return eindeutig(ALLE.map((z) => z.organisation));
}

export function grundformen(): readonly string[] {
  return eindeutig(ALLE.map((z) => z.grundform));
}

/** Das fertige SVG eines Zeichens, oder `null`. Fuer Server Components. */
export function svgFuer(id: string): string | null {
  return findeZeichen(id)?.svg ?? null;
}

/**
 * Die Zeichen-Id aus einem PFADSEGMENT lesen.
 *
 * ⚠️ GEMESSEN AM 2026-09-03 GEGEN `next dev` (Next 16.3.3, Turbopack): der
 * `params.id` von `/m/zeichen/katalog/[id]` kommt PROZENTKODIERT an —
 * `"rezept%3AC.1.1"`, nicht `"rezept:C.1.1"`. Das gilt auch dann, wenn in der
 * Adresszeile ein LITERALER Doppelpunkt steht. Ohne diese Umkehr laege
 * `findeZeichen` fuer jede der 246 Ids daneben und die Detailseite antwortete
 * dauerhaft mit 404 — sichtbar ausschliesslich bei einem echten Abruf:
 * `typecheck`, `lint`, `build` und Vitest kennen die Parameterkodierung eines
 * Requests nicht.
 *
 * ⛔ WIRFT NIE, wie alles andere in dieser Datei. `decodeURIComponent("%")`
 * wirft `URIError`; auf einem Seitenpfad waere das HTTP 500 fuer eine bloss
 * kaputte Adresse. Der Rohwert geht dann unveraendert weiter und laeuft in
 * `findeZeichen` in ein sauberes `null` — also in 404, die richtige Antwort.
 * Vorbild: `lagerbuch/_lib/barcode.ts`.
 */
export function zeichenIdAusPfad(roh: string): ZeichenId {
  try {
    return decodeURIComponent(roh);
  } catch {
    return roh;
  }
}
