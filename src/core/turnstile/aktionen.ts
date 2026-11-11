/**
 * CLOUDFLARE TURNSTILE — was Server und Widget beide kennen (IDA-340, IDA-341). Kein `"use client"`, keine
 * Server-Abhängigkeit: Server Actions, Route Handler und das Widget lesen hier (Falle 6, `CLAUDE.md`).
 */

/** Die Aktion je Formular; die Antwort von Cloudflare muss die Aktion des prüfenden Formulars tragen. */
export const TURNSTILE_AKTIONEN = {
  ehrlich: "ehrlich_einwurf",
  bar: "bar_anfrage",
  mangel: "wartung_mangel",
} as const;
export type TurnstileAktion = (typeof TURNSTILE_AKTIONEN)[keyof typeof TURNSTILE_AKTIONEN];

/** Das Feld, in das das Widget sein Token in ein umgebendes Formular legt (Name von Cloudflare vorgegeben). */
export const TURNSTILE_FELD = "cf-turnstile-response";

/** Die Meldung nach einer abgelehnten Prüfung, in allen Formularen gleich. */
export const TURNSTILE_ABGELEHNT = "Die Prüfung gegen automatische Einsendungen hat nicht geklappt. Versuch es noch einmal.";
