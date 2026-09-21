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
 * Code wäre ein frischer Eintrag. Der zweite Zähler zählt deshalb die FEHLVERSUCHE einer
 * Adresse (`clientIpAus`); eine erfolgreiche Anmeldung bucht nichts. Ist das Budget verbraucht,
 * legt dieser Absender bis zum Ablauf der Minute KEINEN neuen Code-Eintrag mehr an; bestehende
 * Code-Sperren gelten für ihn unverändert weiter.
 *
 * ⛔ DAS BUDGET SPERRT NIEMANDEN AUS, und das ist Absicht, keine Nachsicht. Die Antwort bleibt
 * dieselbe wie ohne Budget (401 für einen unbekannten, 200 für einen gültigen Code). Grund
 * ist die Adresse selbst: auf einem Modul-Host kann `cf-connecting-ip` für ALLE Anfragen
 * dieselbe Egress-Adresse des Servers sein (Befund in `clientIpAus`, `core/ratelimit.ts`) —
 * dann wäre ein sperrender Absender-Zähler eine modulweite Sperre, die dreißig Fremdversuche
 * gegen jeden Teilnehmer schalten. Dasselbe gilt für einen gemeinsamen Vereins-Uplink. Ein
 * Sperren NUR ungültiger Codes wiederum verriete, was die Sperre schützen soll (429 = falsch,
 * 200 = richtig). Der Absender-Zähler begrenzt also, wie viele Code-Einträge EIN Absender
 * erzeugt und verdrängt — nicht, ob er sich anmelden darf.
 */
export const ANMELDUNG_VERSUCHE_JE_CODE_PRO_MIN = 10;
export const ANMELDUNG_FEHLVERSUCHE_JE_ABSENDER_PRO_MIN = 30;

const jeCode = new RateLimiter({ windowMs: 60_000, max: ANMELDUNG_VERSUCHE_JE_CODE_PRO_MIN });
const jeAbsender = new RateLimiter({ windowMs: 60_000, max: ANMELDUNG_FEHLVERSUCHE_JE_ABSENDER_PRO_MIN });

/** Einen Fehlversuch des Absenders buchen — formatfalscher oder unbekannter Code. */
export function fehlversuchBuchen(absender: string): void {
  jeAbsender.check(absender);
}

/**
 * Darf dieser Versuch auf einen FORMATGÜLTIGEN Code weiter? false = der Code ist gesperrt.
 * Bucht auf den Code nur, solange der Absender sein Fehlversuchsbudget nicht verbraucht hat.
 */
export function codeVersuchErlaubt(code: string, absender: string): boolean {
  if (jeAbsender.istGesperrt(absender)) return !jeCode.istGesperrt(code);
  return jeCode.check(code);
}
