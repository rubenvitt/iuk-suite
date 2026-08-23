/**
 * Nur lokale Pfade zulassen (Open-Redirect-Schutz): muss mit einem einzelnen
 * "/" beginnen, kein "//" (protokoll-relativ), keine absolute/Schema-URL.
 *
 * ⛔ 1:1 AUS `src/app/m/lagerbuch/_lib/returnTo.ts:24-32` UEBERNOMMEN — Bauform UND
 * Kommentare —, so wie Spec 1 §3.3.5 es verlangt
 * (`docs/superpowers/specs/2026-08-17-radio-modul-design.md:2417-2419`, woertlich: „wird 1:1
 * aus `src/app/m/lagerbuch/_lib/returnTo.ts` uebernommen und laesst **nur lokale Pfade**
 * durch"). Der Grund steht dort in derselben Zeile: der Wert kommt aus `?returnTo=` und
 * landet in einem `Location`-Kopf.
 *
 * ⛔ KEIN `"use client"` — Falle 6 (`CLAUDE.md`, Punkt 6); durchgesetzt von
 * `src/app/m/radio/riegel.test.ts:684-703`.
 *
 * Fuenf der sechs Ablehnungen sind ZEICHENGLEICH aus dem Bestand uebernommen — nur der
 * Ablageort wechselt. Jede deckt einen anderen Angriff, und drei davon sind nicht
 * offensichtlich; wer hier „aufraeumt", oeffnet einen Open Redirect auf einer Seite, die
 * ANONYM erreichbar ist. Bei `radio` ist genau das der Regelfall: das Gate an `/` und der
 * Einloeseweg `/t/<code>` sind der anonyme Zugang des Moduls.
 *
 * Die SECHSTE Ablehnung (Tab/Zeilenvorschub/Wagenruecklauf) ist KEIN
 * Kopierfehler und KEINE nachtraegliche Verzierung, sondern eine bewusste
 * Haertung dieses Ports gegen die WHATWG-URL-Normalisierung: Browser
 * entfernen beim Parsen eines Location-Werts alle ASCII-Tab-/Newline-Zeichen
 * aus dem String, nicht nur am Rand. Gemessen — die Messung stammt aus dem Bestand und
 * wird hier mit ihrem urspruenglichen Host zitiert, statt sie auf einen Host
 * umzuschreiben, der fuer `radio` noch nicht gemessen ist
 * (`src/app/m/lagerbuch/_lib/returnTo.ts:15-17`):
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
