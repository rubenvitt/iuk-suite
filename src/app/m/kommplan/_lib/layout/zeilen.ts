import type { Stelle } from "../plan/schema";
import { gruppenAnzahl } from "./gruppen";
import type { KartenMass } from "./karte";
import { lueckeFuer } from "./masse";
import { stapelHoehe } from "./seiten";
import type { Sicht } from "./sicht";

/** Zeilenhöhe und Lücke darunter je Baumtiefe (global, damit alle Karten einer Zeile oben bündig stehen). */
export interface Zeilen { hoehe: number[]; luecke: number[] }

export function berechneZeilen(sicht: Sicht, masse: (s: Stelle) => KartenMass): Zeilen {
  const hoehe: number[] = [];
  const knicke: number[] = [];
  for (const st of sicht.sichtbar) {
    if (st.lage !== "unter" && sicht.darstellung(st.id) !== "anker") continue; // Seitenstellen zählen über ihren Stapel
    const t = sicht.tiefe(st.id);
    const m = masse(st);
    const seiten = sicht.seiten(st.id);
    const block = Math.max(m.blockHoehe, stapelHoehe(m, seiten.links.map(masse)), stapelHoehe(m, seiten.rechts.map(masse)));
    hoehe[t] = Math.max(hoehe[t] ?? 0, block);
    const kinder = sicht.kinder(st.id);
    if (kinder.length > 0) knicke[t] = Math.max(knicke[t] ?? 0, gruppenAnzahl(kinder) - 1);
  }
  for (let t = 0; t < hoehe.length; t++) hoehe[t] = hoehe[t] ?? 0;
  return { hoehe, luecke: hoehe.map((_, t) => lueckeFuer(knicke[t] ?? 0)) };
}
