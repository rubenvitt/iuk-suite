/**
 * WAS EINE PERSON AUFS TELEFON BEKOMMT (IDA-297) — ohne Datenbank und ohne Uhr.
 *
 * Zwei Filter hintereinander: die Module, die die Person verwaltet (dasselbe Prädikat wie Seite und
 * Riegel des Moduls, `quellen.ts`), und die Arten, die sie NICHT abgewählt hat. Die Seite selbst zeigt
 * immer alles, was die Person verwalten darf; die Auswahl gilt nur für den Push.
 *
 * Kein `"use client"` (Falle 6).
 */
import type { FaelligkeitsQuelle } from "./quellen";
import type { FaelligkeitsGruppe } from "./sammeln";

/** `lagerbuch:Verfall` — so steht eine Art in `faelligkeiten_abos.abgewaehlt`. */
export function artSchluessel(modul: string, art: string): string {
  return `${modul}:${art}`;
}

/** Für die Auswahl auf der Seite — serialisierbar, geht als Prop an die Insel. */
export interface AuswahlModul {
  modul: string;
  titel: string;
  arten: { schluessel: string; art: string }[];
}

export function auswahlOptionen(quellen: readonly FaelligkeitsQuelle[]): AuswahlModul[] {
  return quellen.map((q) => ({
    modul: q.modul,
    titel: q.titel,
    arten: q.arten.map((art) => ({ schluessel: artSchluessel(q.modul, art), art })),
  }));
}

/**
 * Nur bekannte Schlüssel, ohne Doppel. Was der Browser schickt, ist Eingabe: ein erfundener Schlüssel
 * änderte nichts, bliebe aber für immer in der Zeile stehen.
 */
export function bereinigeAuswahl(eingabe: unknown, quellen: readonly FaelligkeitsQuelle[]): string[] {
  if (!Array.isArray(eingabe)) return [];
  const bekannt = new Set(quellen.flatMap((q) => q.arten.map((a) => artSchluessel(q.modul, a))));
  return [...new Set(eingabe.filter((s): s is string => typeof s === "string" && bekannt.has(s)))].sort();
}

/**
 * Die Gruppen einer Person: nur sichtbare Module, darin nur die angewählten Arten. Ein ausgefallenes
 * Modul bleibt als Fehlergruppe stehen, solange die Person dort überhaupt etwas angewählt hat.
 */
export function fuerPerson(
  gruppen: readonly FaelligkeitsGruppe[],
  quellen: readonly FaelligkeitsQuelle[],
  sichtbareModule: ReadonlySet<string>,
  abgewaehlt: readonly string[],
): FaelligkeitsGruppe[] {
  const aus = new Set(abgewaehlt);
  const artenJeModul = new Map(quellen.map((q) => [q.modul, q.arten]));
  return gruppen
    .filter((g) => sichtbareModule.has(g.modul))
    .filter((g) => (artenJeModul.get(g.modul) ?? []).some((a) => !aus.has(artSchluessel(g.modul, a))))
    .map((g) => ({ ...g, eintraege: g.eintraege.filter((e) => !aus.has(artSchluessel(g.modul, e.art))) }));
}
