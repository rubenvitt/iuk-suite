import { randomInt } from "node:crypto";

/** Crockford-Base32 ohne mehrdeutige Zeichen — WÖRTLICH aus uav-praxis/server/auth/codes.ts:4. */
export const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Länge jedes ausgestellten Codes — die Alt-Anwendung und `loginCodeErzeugen` erzeugen genau so viele Zeichen. */
export const CODE_LAENGE = 8;

/**
 * Obergrenze für den ROHWERT, bevor normalisiert wird (DRK-287). Großzügig über den acht
 * Zeichen, weil ein abgetippter Zettel Leerzeichen, Bindestriche oder einen Zeilenumbruch
 * aus der Zwischenablage mitbringt — aber klein genug, dass kein Rohwert je Speicher bindet.
 */
export const CODE_ROH_MAX_ZEICHEN = 64;

const FORMAT = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LAENGE}}$`);

export function loginCodeErzeugen(): string {
  let code = "";
  for (let i = 0; i < CODE_LAENGE; i++) code += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)];
  return code;
}

/** Abgeschrieben aus codes.ts:24-31 — verteilte Codes auf Zetteln hängen an genau dieser Abbildung. */
export function codeNormalisieren(code: string): string {
  return code.trim().toUpperCase().replace(/[\s-]/g, "").replace(/[IL]/g, "1").replace(/O/g, "0").replace(/U/g, "V");
}

/**
 * Hat ein NORMALISIERTER Code die Form, die tatsächlich ausgestellt wird? Was hier
 * durchfällt, kann keinem Teilnehmer gehören — die Anmeldung verwirft es, bevor ein
 * Zähler dafür entsteht (DRK-287).
 */
export function codeFormatGueltig(normalisiert: string): boolean {
  return FORMAT.test(normalisiert);
}
