import { RateLimiter } from "@/core/ratelimit";

/**
 * Die zwei Zähler der anonymen Code-Anmeldung (DRK-287). Prozessspeicher — Notbremse, kein
 * Budget (Vorbehalt im Kopf von `core/ratelimit.ts`).
 *
 * JE CODE (Spec §4): zehn Versuche pro Minute auf DENSELBEN Code. Gebucht wird erst, wenn der
 * Code die Form eines ausgestellten Codes hat (`codeFormatGueltig`) — ein beliebiger String
 * bekommt keinen Zähler, sonst wüchse der Speicher mit jedem neuen Rohwert.
 *
 * JE ABSENDER: der Code-Zähler sieht nicht, wer immer NEUE Codes durchprobiert — jeder frische
 * Code ist ein frischer Zähler. Dafür zählt der zweite Zähler die FEHLVERSUCHE einer Adresse
 * (`clientIpAus`), und nur diese: eine erfolgreiche Anmeldung bucht nichts. Die Grenze liegt
 * bewusst weit über dem, was Menschen an einem gemeinsamen Vereins-Uplink in einer Minute
 * vertippen, und weit unter dem, was ein Skript durchprobiert. Ist sie erreicht, gilt die
 * Sperre für diese Adresse bis zum Ablauf der Minute — auch für einen gültigen Code, denn eine
 * Ausnahme für gültige Codes verriete genau das, was die Sperre schützen soll (429 = falsch,
 * 200 = richtig). KEIN modulweiter Zähler: der sperrte mit genug Fremdversuchen alle aus.
 */
export const ANMELDUNG_VERSUCHE_JE_CODE_PRO_MIN = 10;
export const ANMELDUNG_FEHLVERSUCHE_JE_ABSENDER_PRO_MIN = 30;

const jeCode = new RateLimiter({ windowMs: 60_000, max: ANMELDUNG_VERSUCHE_JE_CODE_PRO_MIN });
const jeAbsender = new RateLimiter({ windowMs: 60_000, max: ANMELDUNG_FEHLVERSUCHE_JE_ABSENDER_PRO_MIN });

/** Hat dieser Absender sein Fehlversuchsbudget verbraucht? Bucht nichts. */
export function absenderGesperrt(absender: string): boolean {
  return jeAbsender.istGesperrt(absender);
}

/** Einen Fehlversuch des Absenders buchen — formatfalscher oder unbekannter Code. */
export function fehlversuchBuchen(absender: string): void {
  jeAbsender.check(absender);
}

/** Bucht einen Versuch auf einen FORMATGÜLTIGEN Code; false = Limit erreicht. */
export function codeVersuchErlaubt(code: string): boolean {
  return jeCode.check(code);
}
