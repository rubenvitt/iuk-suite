/**
 * Nur lokale Pfade zulassen (Open-Redirect-Schutz): muss mit einem einzelnen
 * "/" beginnen, kein "//" (protokoll-relativ), keine absolute/Schema-URL.
 *
 * Fuenf der sechs Ablehnungen sind ZEICHENGLEICH aus
 * `lagerbuch/src/lib/auth/returnTo.ts` uebernommen — nur der Ablageort
 * wechselt (§3.1). Jede deckt einen anderen Angriff, und drei davon sind
 * nicht offensichtlich; wer hier „aufraeumt", oeffnet einen Open Redirect
 * auf einer Seite, die anonym erreichbar ist.
 *
 * Die SECHSTE Ablehnung (Tab/Zeilenvorschub/Wagenruecklauf) ist KEIN
 * Kopierfehler und KEINE nachtraegliche Verzierung, sondern eine bewusste
 * Haertung dieses Ports gegen die WHATWG-URL-Normalisierung: Browser
 * entfernen beim Parsen eines Location-Werts alle ASCII-Tab-/Newline-Zeichen
 * aus dem String, nicht nur am Rand. Gemessen:
 *   new URL("/\t/boese.example", "https://lagerbuch.iuk-ue.de").href
 *     → "https://boese.example/"
 * Ohne diese Pruefung bestehen alle fuenf Bestandsablehnungen — kein
 * fehlender Slash, kein "//"-Praefix (das zweite Zeichen ist das
 * Steuerzeichen), kein "/\", kein Doppelpunkt — und das Ziel wird trotzdem
 * cross-origin. Deshalb: ABLEHNEN statt bereinigen, sonst prueft dieser Code
 * einen anderen String als den, der am Ende in den Location-Kopf wandert.
 */
export function sanitizeReturnTo(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  if (/[\t\n\r]/.test(raw)) return null; // Browser entfernen diese Zeichen beim URL-Parsing (WHATWG)
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//")) return null;
  if (raw.startsWith("/\\")) return null; // Browser normalisieren "/\..." zu "//..." (protokoll-relativ)
  if (raw.includes(":")) return null; // z. B. "/x:foo" oder eingeschmuggelte Schemata
  return raw;
}
