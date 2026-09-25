import { auditDenied } from "@/core/audit/server";
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
 * legt dieser Absender bis zum Ablauf der Minute KEINEN neuen Code-Eintrag mehr an; auf einen
 * Code, für den schon ein Eintrag besteht, bucht er weiter wie jeder andere.
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
 * Über dem Budget bucht der Absender nur noch auf BESTEHENDE Code-Einträge — ein reines
 * Nachsehen reichte nicht: dann zählte sein Verkehr auf keinen Code mehr, und die Bremse je
 * Code wäre für genau den Absender aus, der sie ausgelöst hat.
 */
export function codeVersuchErlaubt(code: string, absender: string): boolean {
  return jeCode.check(code, jeAbsender.istGesperrt(absender));
}

/**
 * Obergrenze für die AUDIT-ZEILEN verworfener Anmeldungen (DRK-447) — modulweit, nicht je
 * Absender. Die beiden Zähler oben bremsen je Code und je Adresse; teilen sich alle Anfragen
 * eine Adresse (Egress des Modul-Hosts) oder ist sie gefälscht (Container an Cloudflare
 * vorbei), gibt es über sie keine Obergrenze für Zeilen in der Audit-Datenbank.
 *
 * Deshalb: je Minutenfenster höchstens `ANMELDUNG_AUDIT_ABLEHNUNGEN_PRO_MIN` einzelne Zeilen,
 * danach EINE Zeile `access_throttled` („ab hier nicht mehr einzeln protokolliert") und bis
 * zum nächsten Fenster nichts mehr. Die Markierung ist die Spur eines Scans — ganz verwerfen
 * hieße, genau den Angriff unsichtbar zu machen, gegen den die Zeilen da sind. Höchstens
 * `ANMELDUNG_AUDIT_ABLEHNUNGEN_PRO_MIN + 1` Zeilen je Minute, egal wie viele Absender.
 *
 * ⛔ Gilt NUR für Ablehnungen. Eine erfolgreiche Anmeldung protokolliert die Route direkt und
 * unabhängig von diesem Fenster; die Drossel ändert auch keine Antwort.
 *
 * Festes Fenster statt `RateLimiter`: nur ein Schlüssel, und für die Markierung zählt, ob sie
 * in DIESEM Fenster schon geschrieben ist — das ist ein Zustand je Fenster, kein Zeitstempel-
 * Verlauf. Prozessspeicher wie oben: nach einem Neustart beginnt ein frisches Fenster.
 */
export const ANMELDUNG_AUDIT_ABLEHNUNGEN_PRO_MIN = 10;

export type AuditEntscheid = "einzeln" | "gedrosselt" | "still";

export class AblehnungsDrossel {
  private fensterStart = -Infinity;
  private geschrieben = 0;
  private markiert = false;
  constructor(private readonly opts: { max: number; windowMs: number; now?: () => number }) {}
  /** Was soll für DIESE Ablehnung ins Audit? Bucht zugleich. */
  entscheiden(): AuditEntscheid {
    const t = (this.opts.now ?? Date.now)();
    if (t - this.fensterStart >= this.opts.windowMs) { this.fensterStart = t; this.geschrieben = 0; this.markiert = false; }
    if (this.geschrieben < this.opts.max) { this.geschrieben++; return "einzeln"; }
    if (!this.markiert) { this.markiert = true; return "gedrosselt"; }
    return "still";
  }
}

const auditAblehnungen = new AblehnungsDrossel({ max: ANMELDUNG_AUDIT_ABLEHNUNGEN_PRO_MIN, windowMs: 60_000 });

/** Die verworfene Anmeldung protokollieren — im Rahmen der modulweiten Obergrenze. */
export function ablehnungProtokollieren(): void {
  const entscheid = auditAblehnungen.entscheiden();
  if (entscheid === "einzeln") auditDenied("uav");
  else if (entscheid === "gedrosselt") auditDenied("uav", { kind: "anonymous" }, "access_throttled");
}
