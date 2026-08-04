/**
 * Nur lokale Pfade zulassen (Open-Redirect-Schutz): muss mit einem einzelnen
 * "/" beginnen, kein "//" (protokoll-relativ), keine absolute/Schema-URL.
 *
 * ZEICHENGLEICH aus `lagerbuch/src/lib/auth/returnTo.ts` — nur der Ablageort
 * wechselt (§3.1). Jede der fuenf Ablehnungen deckt einen anderen Angriff, und
 * drei davon sind nicht offensichtlich; wer hier „aufraeumt", oeffnet einen
 * Open Redirect auf einer Seite, die anonym erreichbar ist.
 */
export function sanitizeReturnTo(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//")) return null;
  if (raw.startsWith("/\\")) return null; // Browser normalisieren "/\..." zu "//..." (protokoll-relativ)
  if (raw.includes(":")) return null; // z. B. "/x:foo" oder eingeschmuggelte Schemata
  return raw;
}
