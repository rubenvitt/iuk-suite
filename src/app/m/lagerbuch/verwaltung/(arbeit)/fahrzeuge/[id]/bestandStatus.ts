/**
 * WAS AN EINER ZEILE DER BESTANDSLISTE AUFFÄLLT (IDA-232) — reine Funktionen,
 * ohne Direktive, damit Vitest sie ohne Rendern prüft.
 *
 * ⚠️ „abgelaufen" UND „läuft ab" TEILEN WIE DIE KACHELN, nicht über den Ton
 * allein (DRK-340, `verfallKennzahlen` in `page.tsx`): eine abgelaufene Meldung
 * ist immer rot, eine rote nicht immer abgelaufen. Eine rote, noch nicht
 * abgelaufene Meldung gehört nach „läuft ab" — sonst filterte ein Klick auf die
 * Kachel „läuft ab" genau die Zeile weg, die die Kachel gezählt hat.
 *
 * ⚠️ „unter Soll" RECHNET WIE DIE FAHRZEUGLISTE (`fahrzeugUebersicht`): der
 * Bestand des Artikels im Fahrzeug gegen die SUMME seiner Soll-Positionen.
 * Steht ein Artikel in zwei Fächern, ist der Bestand nicht je Fach bekannt.
 */
import type { AmpelTon } from "../../../../_lib/format";
import type { StatusFilter } from "./reiter";

export type BestandStatusZeile = {
  statusTon: AmpelTon | null;
  abgelaufen: boolean;
  bestand: number;
  soll: number;
};

export function istAbgelaufen(zeile: BestandStatusZeile): boolean {
  return zeile.abgelaufen;
}

export function laeuftAb(zeile: BestandStatusZeile): boolean {
  return !zeile.abgelaufen && (zeile.statusTon === "rot" || zeile.statusTon === "gelb");
}

export function unterSoll(zeile: BestandStatusZeile): boolean {
  return zeile.bestand < zeile.soll;
}

export function nichtErfasst(zeile: BestandStatusZeile): boolean {
  return zeile.statusTon === null;
}

export function auffaellig(zeile: BestandStatusZeile): boolean {
  return istAbgelaufen(zeile) || laeuftAb(zeile) || unterSoll(zeile);
}

const PRUEFUNG: Record<StatusFilter, (zeile: BestandStatusZeile) => boolean> = {
  auffaellig,
  abgelaufen: istAbgelaufen,
  "laeuft-ab": laeuftAb,
  "unter-soll": unterSoll,
  "nicht-erfasst": nichtErfasst,
};

export function trifftStatus(zeile: BestandStatusZeile, status: StatusFilter | null): boolean {
  return status === null || PRUEFUNG[status](zeile);
}

/**
 * Die Dringlichkeit einer Zeile — kleiner heißt weiter oben.
 *
 * Abgelaufen vor „läuft ab" vor „unter Soll": was schon nicht mehr verwendet
 * werden darf, kommt vor dem, was bald nicht mehr verwendet werden darf, und
 * beides vor einer Fehlmenge. „Nicht erfasst" steht vor den unauffälligen
 * Zeilen, weil dort niemand weiß, was drin liegt — Entwarnung ist es nicht.
 */
export function dringlichkeit(zeile: BestandStatusZeile): number {
  if (istAbgelaufen(zeile)) return 0;
  if (laeuftAb(zeile)) return 1;
  if (unterSoll(zeile)) return 2;
  if (nichtErfasst(zeile)) return 3;
  return 4;
}

export function zaehleStatus(
  zeilen: readonly BestandStatusZeile[],
): Record<StatusFilter, number> {
  const zahlen: Record<StatusFilter, number> = {
    auffaellig: 0,
    abgelaufen: 0,
    "laeuft-ab": 0,
    "unter-soll": 0,
    "nicht-erfasst": 0,
  };
  for (const zeile of zeilen) {
    for (const [status, pruefe] of Object.entries(PRUEFUNG) as [StatusFilter, typeof auffaellig][]) {
      if (pruefe(zeile)) zahlen[status] += 1;
    }
  }
  return zahlen;
}
