// Zufallswerte des Live-Quiz. Nur Server (node:crypto), kein "use client" (Falle 6, `CLAUDE.md`).
import { createHash, randomBytes, randomInt } from "node:crypto";

/** Ohne 0/O, 1/I: der Code wird von der Leinwand abgetippt. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LAENGE = 6;

/** Moderations-Secret: 32 Byte (256 bit) als base64url. Wer es kennt, steuert das Quiz. */
export function neuesSecret(): string {
  return randomBytes(32).toString("base64url");
}

/** Kurzer Beitrittscode. Eindeutig nur unter den offenen Runden; das prüft `_db/quiz.ts`. */
export function neuerBeitrittCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LAENGE; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

/** Gespeichert wird nur der Hash des Cookie-Werts, nie das Token selbst. */
export function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Teilnahme-Token fürs Cookie: 32 Byte als base64url. In der Datenbank steht nur `tokenHash`. */
export function neuesToken(): string {
  return randomBytes(32).toString("base64url");
}
