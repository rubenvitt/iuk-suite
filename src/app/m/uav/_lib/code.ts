import { randomInt } from "node:crypto";

/** Crockford-Base32 ohne mehrdeutige Zeichen — WÖRTLICH aus uav-praxis/server/auth/codes.ts:4. */
export const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function loginCodeErzeugen(): string {
  let code = "";
  for (let i = 0; i < 8; i++) code += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)];
  return code;
}

/** Abgeschrieben aus codes.ts:24-31 — verteilte Codes auf Zetteln hängen an genau dieser Abbildung. */
export function codeNormalisieren(code: string): string {
  return code.trim().toUpperCase().replace(/[\s-]/g, "").replace(/[IL]/g, "1").replace(/O/g, "0").replace(/U/g, "V");
}
