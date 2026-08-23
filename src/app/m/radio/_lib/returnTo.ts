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
 * ⛔ AUFLAGE AN DEN AUFRUFER (A9/A10): DIE HAELFTE `typeof raw !== "string"` IST TRAGEND.
 * `formData.get("returnTo")` liefert `string | File | null`
 * (Bestandsform: `src/app/m/lagerbuch/_actions/gate.ts:51` umhuellt den Wert deshalb mit
 * `String(...)`), und `searchParams` liefert bei doppelt gesetztem Parameter ein Array.
 * Ohne diese Haelfte ist der Nicht-String kein `null`, sondern ein geworfener
 * `TypeError: raw.startsWith is not a function` — an einer ANONYM erreichbaren Flaeche.
 * Der Prueffall dazu: `returnTo.test.ts`, „verwirft Nicht-String aus doppeltem Parameter".
 *
 * ALLE SECHS Ablehnungen sind ZEICHENGLEICH aus dem Bestand uebernommen — nur der
 * Ablageort wechselt (Rumpfvergleich Zeile fuer Zeile: die sechs Ablehnungen `:53-58` hier gegen
 * `src/app/m/lagerbuch/_lib/returnTo.ts:25-30`, der Durchlass `:59` gegen dort `:31`).
 * Jede deckt einen anderen Angriff, und drei
 * davon sind nicht offensichtlich; wer hier „aufraeumt", oeffnet einen Open Redirect auf
 * einer Seite, die ANONYM erreichbar ist. Bei `radio` ist genau das der Regelfall: das Gate
 * an `/` und der Einloeseweg `/t/<code>` sind der anonyme Zugang des Moduls.
 *
 * ⚠️ Die Zaehlung „fuenf plus eine" der Vorlage gilt HIER NICHT und stand bis zur Fix-Runde
 * 1 falsch in diesem Kopf. Sie stammt aus `src/app/m/lagerbuch/_lib/returnTo.ts:5-6` und
 * bezieht sich dort auf die Vor-Suite-Fassung `lagerbuch/src/lib/auth/returnTo.ts`.
 *
 * Die Ablehnung Tab/Zeilenvorschub/Wagenruecklauf ist KEIN
 * Kopierfehler und KEINE nachtraegliche Verzierung, sondern eine bewusste
 * Haertung gegen die WHATWG-URL-Normalisierung, die schon der Bestand traegt
 * (`src/app/m/lagerbuch/_lib/returnTo.ts:26`): Browser
 * entfernen beim Parsen eines Location-Werts alle ASCII-Tab-/Newline-Zeichen
 * aus dem String, nicht nur am Rand. Gemessen — die Messung stammt aus dem Bestand und
 * wird hier mit ihrem urspruenglichen Host zitiert, statt sie auf einen Host
 * umzuschreiben, der fuer `radio` noch nicht gemessen ist
 * (`src/app/m/lagerbuch/_lib/returnTo.ts:15-17`):
 *   new URL("/\t/boese.example", "https://lagerbuch.iuk-ue.de").href
 *     → "https://boese.example/"
 * Ohne diese Pruefung bestehen alle fuenf uebrigen Ablehnungen — kein
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
