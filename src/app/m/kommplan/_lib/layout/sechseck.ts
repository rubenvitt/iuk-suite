import { PIKTOGRAMME, VERBINDUNG_PIKTOGRAMM } from "../zeichen/grundlagen";
import type { Verbindung, VerbindungsArt } from "../plan/schema";
import { SCHRIFT, SECHSECK } from "./masse";
import { grundlinie, kuerze, textBreite } from "./text";
import type { SechseckForm, TextZeile } from "./typen";

/** Spec §5.2: die Form trägt die Verbindungsart — Funk spitz, Leitung gefast, Mobil spitz und gestrichelt. */
export function sechseckForm(art: VerbindungsArt): SechseckForm {
  if (art === "tmo" || art === "dmo" || art === "analogfunk") return "funk";
  return art === "mobil" ? "mobil" : "leitung";
}

export interface PiktoPlatz { x: number; y: number; breite: number; hoehe: number }
export interface SechseckMass { breite: number; hoehe: number; form: SechseckForm; beschriftung: TextZeile; voll: string; piktogramm: string; pikto: PiktoPlatz }

/**
 * Der Platz des Piktogramms im Sechseck: 7 × 4 mm hinter der linken Spitze, senkrecht mittig. Trägt
 * das Piktogramm selbst Schrift (TMO, DMO, Fax, C), rückt der Platz so, dass diese Schrift auf der
 * Grundlinie der Beschriftung steht — „TMO R_UE_1" ist eine Zeile, mittig gesetzt saß „TMO"
 * 0,36 mm tiefer (Review Phase 1). Eingepasst wird wie `<use>` es tut: xMidYMid meet.
 */
function piktoPlatz(piktogramm: string, grundlinieY: number): PiktoPlatz {
  const mittig: PiktoPlatz = { x: SECHSECK.spitze, y: (SECHSECK.hoehe - SECHSECK.piktoHoehe) / 2, breite: SECHSECK.piktoBreite, hoehe: SECHSECK.piktoHoehe };
  const q = PIKTOGRAMME[piktogramm];
  const textY = q ? /<text\b[^>]*\by="([-\d.]+)"/.exec(q.inhalt)?.[1] : undefined;
  if (!q || textY === undefined) return mittig;
  const [, vy, vw, vh] = q.viewBox.split(/\s+/).map(Number);
  const f = Math.min(mittig.breite / vw, mittig.hoehe / vh);
  const y = grundlinieY - (mittig.hoehe - vh * f) / 2 - (Number(textY) - vy) * f;
  // nie über den Rand des Sechsecks hinaus
  const rand = (mittig.hoehe - vh * f) / 2;
  return { ...mittig, y: Math.min(SECHSECK.hoehe - mittig.hoehe + rand, Math.max(-rand, y)) };
}

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
  const y = grundlinie(0, SECHSECK.hoehe, SCHRIFT.sechseck);
  return {
    breite, hoehe: SECHSECK.hoehe, form: sechseckForm(v.art), voll,
    piktogramm: VERBINDUNG_PIKTOGRAMM[v.art], pikto: piktoPlatz(VERBINDUNG_PIKTOGRAMM[v.art], y),
    beschriftung: { text, x: (anfang + ende) / 2, y, groesse: SCHRIFT.sechseck, fett: true, anker: "mitte" },
  };
}
