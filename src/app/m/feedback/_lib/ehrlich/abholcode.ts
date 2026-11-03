import { createHash, randomInt } from "node:crypto";

/**
 * DER ABHOLCODE (IDA-309, Entscheidung 2026-11-01): wer anonym eine Antwort möchte, bekommt nach dem
 * Absenden einen Code der Form `WORT-0000-WORT` und liest darunter später die Antwort.
 *
 * Gespeichert wird nur der SHA-256 des genormten Codes (`code_hash`). Die Verwaltung sieht den Code
 * damit nie im Klartext; gegen jemanden mit der Datenbank in der Hand schützt der Hash bei 14,4 Mio.
 * Codes (40 × 9000 × 40) nicht. Raten über die Seite bremst `fehlversuche` in `aktionen.ts`.
 */
export const CODE_WOERTER = [
  "AHORN", "BIRKE", "BUCHE", "DACHS", "ELCH", "ERLE", "ESCHE", "FALKE", "FICHTE", "FUCHS",
  "HAFEN", "HASE", "IGEL", "KIEFER", "KRANICH", "LERCHE", "LINDE", "LUCHS", "MARDER", "MEISE",
  "MOEWE", "OTTER", "PAPPEL", "REIHER", "SPECHT", "STORCH", "TANNE", "ULME", "WEIDE", "WIESEL",
  "AMSEL", "BIBER", "DOHLE", "EULE", "FINK", "GEMSE", "HIRSCH", "KAUZ", "RABE", "WOLF",
] as const;

export function neuerAbholcode(zufall: (max: number) => number = randomInt): string {
  const wort = () => CODE_WOERTER[zufall(CODE_WOERTER.length)];
  return `${wort()}-${1000 + zufall(9000)}-${wort()}`;
}

/** Groß/klein egal, Umlaute wie gedruckt (Ö → OE), beliebige Trenner → `-`. */
export function normiereAbholcode(roh: string): string {
  return roh
    .toUpperCase()
    .replace(/Ä/g, "AE")
    .replace(/Ö/g, "OE")
    .replace(/Ü/g, "UE")
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function abholcodeHash(code: string): string {
  return createHash("sha256").update(`ehrlich-gesagt:${normiereAbholcode(code)}`).digest("hex");
}
