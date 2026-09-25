/**
 * Geheimnisse der Rechner-Anbindung (Spec §12): Einmalcodes, Sitzungs- und Geräte-Tokens sind
 * 32 Zufallsbytes in base64url ohne Padding (43 Zeichen). Gespeichert wird immer nur der
 * SHA-256-Hash. Node-`crypto` ist hier erlaubt, denn dieses Modul gehört nicht zum geteilten Kern.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** Form eines Geheimnisses auf dem Draht; `vertrag.ts` prüft Tokens und Codes damit. */
export const GEHEIMNIS = /^[A-Za-z0-9_-]{43}$/;
const BEARER = /^Bearer ([A-Za-z0-9_-]{43})$/;

export function neuesGeheimnis(): string {
  return randomBytes(32).toString("base64url");
}

export function hashVon(geheimnis: string): string {
  return createHash("sha256").update(geheimnis, "utf8").digest("hex");
}

/** PKCE S256 (RFC 7636, Abschnitt 4.2): base64url(SHA-256(ASCII(verifier))). */
export function s256(verifier: string): string {
  return createHash("sha256").update(verifier, "ascii").digest("base64url");
}

/** Vergleich in konstanter Zeit. Verglichen werden Bytes: `timingSafeEqual` wirft bei ungleicher Bytelänge. */
export function gleich(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Das Token aus `Authorization: Bearer <43 Zeichen base64url>`, sonst `null` (auch bei „bearer“). */
export function bearerAus(req: Request): string | null {
  return BEARER.exec(req.headers.get("authorization") ?? "")?.[1] ?? null;
}

