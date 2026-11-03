/**
 * Fassung einer Antwort für `ETag`/`If-None-Match`. Der Lagemonitor holt seine Einstellungen jede
 * Minute (`api/konfiguration`); meist hat sich nichts geändert, und dann reicht ein 304 ohne Körper.
 * Der FüKw hängt am Mobilfunk.
 */
import { createHash } from "node:crypto";

export function etagVon(koerper: string): string {
  return `"${createHash("sha256").update(koerper).digest("base64url").slice(0, 22)}"`;
}

/**
 * Passt `If-None-Match` zu `etag`? Ein Proxy, der komprimiert (Cloudflare), macht aus einem starken
 * ETag einen schwachen (`W/"…"`); für einen 304 zählt nur der Wert (schwacher Vergleich, RFC 9110).
 */
export function unveraendert(ifNoneMatch: string | null, etag: string): boolean {
  if (!ifNoneMatch) return false;
  const ohneW = (t: string) => t.trim().replace(/^W\//, "");
  return ifNoneMatch.split(",").some((t) => ohneW(t) === ohneW(etag) || t.trim() === "*");
}
