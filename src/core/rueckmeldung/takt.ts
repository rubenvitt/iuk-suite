/**
 * HÖCHSTENS 5 RÜCKMELDUNGEN JE PERSON UND STUNDE (Entscheidung vom 12.10.2026).
 *
 * Im Prozessspeicher und nicht in einer Datenbank: die Grenze bremst
 * Doppelklicks und Missbrauch, sie ist keine Abrechnung. Ein Neustart setzt sie
 * zurück; das ist hinnehmbar. Zunder hat am Eingang eine eigene Grenze.
 */

export const TAKT_GRENZE = 5;
export const TAKT_FENSTER_MS = 60 * 60 * 1000;

const verlauf = new Map<string, number[]>();

/** Nur für Tests. */
export function _taktZuruecksetzen(): void {
  verlauf.clear();
}

/** `true` und zählt mit, wenn die Person noch darf; sonst `false`, ohne zu zählen. */
export function nimmTakt(person: string, jetzt: number = Date.now()): boolean {
  const frisch = (verlauf.get(person) ?? []).filter((t) => jetzt - t < TAKT_FENSTER_MS);
  if (frisch.length >= TAKT_GRENZE) {
    verlauf.set(person, frisch);
    return false;
  }
  frisch.push(jetzt);
  verlauf.set(person, frisch);
  return true;
}

/**
 * Ein Fehlschlag beim Zustellen soll die Person nicht ausbremsen: wer dreimal
 * „Nochmal senden" drückt, weil Zunder kurz weg war, hat nichts gemeldet.
 */
export function gibTaktZurueck(person: string): void {
  verlauf.get(person)?.pop();
}
