/**
 * ALLE MASSE DER LAYOUT-ENGINE — Layout-Millimeter bei Maßstab 1, Schrift in pt.
 *
 * Abgeleitet aus den Referenzbildern der Excel-Vorlage (A4 quer, 150 dpi) und um 4/3
 * vergrößert: die Vorlage setzt ihre Schrift bei etwa 6 pt, die Engine rechnet mit 8 pt als
 * kleinster Schrift. Auf A4 landen die Vorlagenpläne so bei Maßstab ≈ 0,82 — dieselbe
 * Anmutung wie heute und Luft bis zur Mindestschrift. Herleitung: Umsetzungsplan Phase 1,
 * Abschnitt „Maße".
 */
export const PT_IN_MM = 25.4 / 72;
export const ZEILENFAKTOR = 1.15;
export const SCHRIFT = { titel: 9.5, leiter: 8, kontakt: 8, einheit: 8, sechseck: 8, abzeichen: 8, verweis: 8 } as const;
export const MINDESTSCHRIFT_PT = 6;
export const KLEINSTE_SCHRIFT_PT = Math.min(...Object.values(SCHRIFT));
/** Kleiner darf eine Zeichnung auf Papier nicht werden, sonst unterschreitet Text 6 pt. */
export const MIN_MASSSTAB = MINDESTSCHRIFT_PT / KLEINSTE_SCHRIFT_PT;

export const KARTE = {
  breite: 46, rand: 1.2, zeichen: 10, titelX: 12.5, innenRechts: 1.5,
  kopfMin: 12, titelZeilenMax: 3, titelMin: 8, titelStufe: 0.5,
  kontaktHoehe: 4.5, piktoSpalte: 8, piktoGroesse: 3.6, wertX: 9.5, kontaktZeilenMax: 2,
} as const;
/** `hoehe`/`takt` gelten für einen einzeiligen Kasten; ein zweizeiliger wächst um eine Zeilenhöhe, die Luft dazwischen bleibt. */
export const EINHEIT = { abstandOben: 2.5, hoehe: 4.2, takt: 5.5, breite: 40, einzugMin: 6, zweiSpaltenAb: 10, spaltenAbstand: 2, zeichen: 3.6, zeilenMax: 2 } as const;
/** Kanal-Sechsecke einer Stelle (Abweichung 12): untereinander in der Gasse, über den Einheiten. */
export const KANAL = { takt: 7.5 } as const;
export const ABZEICHEN = { breite: 22, hoehe: 4.5, abstand: 1.5 } as const;
export const SECHSECK = { hoehe: 6, spitze: 3, piktoBreite: 7, piktoHoehe: 4, innen: 1.5, minBreite: 26, maxBreite: 44, fase: 1.5 } as const;
export const STIEL = {
  ersterKnick: 2, knickTakt: 1.5, zuSechseck: 1.5, sechseckZuBus: 2, busZuKarte: 4,
  gasseStart: 1.5, gasseTakt: 1.5,
} as const;
export const ABSTAND = {
  geschwister: 8, gruppen: 12, wurzeln: 16, kammReihe: 8, kammEinzug: 3,
  seiteSchiene: 3, seiteLuft: 3, seiteOhneSechseck: 6, seitenStapel: 4,
} as const;
/**
 * Was die Geometrieprüfung (`pruefung.ts`) mindestens verlangt — und was das Packen deshalb
 * einhält (`kontur.ts`, `LUFT_Y`): Kästen verschiedener Stellen 2 mm, parallele Linien
 * verschiedener Netze 0,75 mm.
 */
export const MINDEST = { kasten: 2, linie: 0.75 } as const;
export const PAPIER = { "a4-quer": { breite: 297, hoehe: 210 }, "a3-quer": { breite: 420, hoehe: 297 } } as const;
/** `luft`: zwischen Kopflinie und Zeichnung und zwischen Zeichnung und Legende (Review Phase 1: 1 und 2 mm klebten). */
export const BLATT = { randX: 10, randOben: 8, randUnten: 8, kopf: 14, fuss: 7, legendeZeile: 5, luft: 3 } as const;

export function zeilenhoehe(pt: number): number {
  return pt * PT_IN_MM * ZEILENFAKTOR;
}

/**
 * Höhe zwischen Zeilenunterkante und Kartenoberkante der nächsten Ebene. `j` = größte Zahl von
 * Knicken, die ein Stiel dieser Ebene braucht (Gruppenzahl − 1). Aufbau: erster Knick, weitere
 * Knicke im Takt, Luft bis zum Sechseck, Sechseck, Luft bis zum Bus, Bus bis Karte.
 */
export function lueckeFuer(j: number): number {
  return STIEL.ersterKnick + Math.max(0, j - 1) * STIEL.knickTakt + STIEL.zuSechseck
    + SECHSECK.hoehe + STIEL.sechseckZuBus + STIEL.busZuKarte;
}
