import { randomBytes, randomUUID } from "node:crypto";

/** Kennung eines Datensatzes. */
export const neueId = (): string => randomUUID();

/**
 * Zufallskennung für einen Link ohne Anmeldung (persönlicher Link eines Mitglieds, Statusseite einer
 * Bar-Anfrage): 128 Bit, base64url, 22 Zeichen. Nicht erratbar; wer den Link hat, kommt hinein.
 */
export const neuerLinkCode = (): string => randomBytes(16).toString("base64url");

/** Form eines Link-Codes, bevor er die Datenbank erreicht (Seiten antworten sonst mit 404). */
export const istLinkCode = (s: string): boolean => /^[A-Za-z0-9_-]{22}$/.test(s);
