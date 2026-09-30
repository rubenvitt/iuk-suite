import { VERBINDUNG_PIKTOGRAMM } from "../zeichen/grundlagen";
import type { Verbindung, VerbindungsArt } from "../plan/schema";
import { SCHRIFT, SECHSECK } from "./masse";
import { grundlinie, kuerze, textBreite } from "./text";
import type { SechseckForm, TextZeile } from "./typen";

/** Spec §5.2: die Form trägt die Verbindungsart — Funk spitz, Leitung gefast, Mobil spitz und gestrichelt. */
export function sechseckForm(art: VerbindungsArt): SechseckForm {
  if (art === "tmo" || art === "dmo" || art === "analogfunk") return "funk";
  return art === "mobil" ? "mobil" : "leitung";
}

export interface SechseckMass { breite: number; hoehe: number; form: SechseckForm; beschriftung: TextZeile; voll: string; piktogramm: string }

/** Feste Anteile: Spitze links, Piktogramm, Luft beidseits der Beschriftung, Spitze rechts. */
const FEST = SECHSECK.spitze + SECHSECK.piktoBreite + 2 * SECHSECK.innen + SECHSECK.spitze;

export function sechseckMass(v: Verbindung): SechseckMass {
  const voll = v.bezeichnung.trim();
  const { text, gekuerzt } = kuerze(voll, SECHSECK.maxBreite - FEST, SCHRIFT.sechseck, true);
  // Gekürzt heißt: die Beschriftung hat die ganze Breite gebraucht — dann steht das Sechseck voll
  // (die Kürzung bleibt sonst je nach Zeichenbreite ein paar Zehntel darunter).
  const breite = gekuerzt
    ? SECHSECK.maxBreite
    : Math.min(SECHSECK.maxBreite, Math.max(SECHSECK.minBreite, FEST + textBreite(text, SCHRIFT.sechseck, true)));
  const anfang = SECHSECK.spitze + SECHSECK.piktoBreite + SECHSECK.innen;
  const ende = breite - SECHSECK.spitze - SECHSECK.innen;
  return {
    breite, hoehe: SECHSECK.hoehe, form: sechseckForm(v.art), voll,
    piktogramm: VERBINDUNG_PIKTOGRAMM[v.art],
    beschriftung: { text, x: (anfang + ende) / 2, y: grundlinie(0, SECHSECK.hoehe, SCHRIFT.sechseck), groesse: SCHRIFT.sechseck, fett: true, anker: "mitte" },
  };
}
