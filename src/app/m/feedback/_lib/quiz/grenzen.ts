// Notbremsen der öffentlichen Quizwege (`core/ratelimit`, Prozessspeicher, siehe Vorbehalt dort).
// An einer Stelle, damit `schritt` und `beenden` denselben Zähler je Secret teilen.
import { RateLimiter } from "@/core/ratelimit";

const MINUTE_MS = 60_000;

/** Beitritt: 10 je Minute und Absenderadresse (`clientIpAus`); unbekannte Codes zählen mit. */
export const beitrittGrenze = new RateLimiter({ windowMs: MINUTE_MS, max: 10 });
/** Antwort: 60 je Minute und Token (geführt als Hash, nie das Token selbst). */
export const antwortGrenze = new RateLimiter({ windowMs: MINUTE_MS, max: 60 });
/** Steuerung (Schritt, Beenden): 120 je Minute und Moderations-Secret (als Hash). */
export const steuerGrenze = new RateLimiter({ windowMs: MINUTE_MS, max: 120 });
