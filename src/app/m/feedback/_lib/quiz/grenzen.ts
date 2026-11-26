// Notbremsen der öffentlichen Quizwege (`core/ratelimit`, Prozessspeicher, siehe Vorbehalt dort).
// An einer Stelle, damit `schritt` und `beenden` denselben Zähler je Secret teilen.
import { RateLimiter } from "@/core/ratelimit";

const MINUTE_MS = 60_000;

/**
 * Beitritt je Minute und Absenderadresse (`clientIpAus`); unbekannte Codes zählen mit. So hoch,
 * weil ein ganzer Raum hinter EINER Adresse sitzt (WLAN-NAT) und beim QR-Code zugleich beitritt.
 * Die Menge begrenzt `MAX_TEILNAHMEN_JE_RUNDE`, nicht diese Drossel.
 */
export const BEITRITT_JE_MINUTE = 120;
/** Harte Obergrenze je Runde (`tritteBei` → `"voll"`, HTTP 409). Ein Wiederbeitritt zählt nicht neu. */
export const MAX_TEILNAHMEN_JE_RUNDE = 200;

export const beitrittGrenze = new RateLimiter({ windowMs: MINUTE_MS, max: BEITRITT_JE_MINUTE });
/**
 * Fehlgriffe auf Strom und Antwort (unbekannter oder beendeter Code, HTTP 404) je Minute und Adresse.
 * EIGENER Zähler, nicht `beitrittGrenze`: ein Raum, der nach einem verpassten `ende` mit 40 Handys
 * weiter nachfragt, darf den Beitritt zur nächsten Runde hinter derselben Adresse nie aushungern.
 * Hoch genug für dieses Nachfragen, niedrig genug gegen Durchprobieren (32^6 Codes).
 */
export const PROBE_JE_MINUTE = 600;
export const probeGrenze = new RateLimiter({ windowMs: MINUTE_MS, max: PROBE_JE_MINUTE });
/** Antwort: 60 je Minute und Token (geführt als Hash, nie das Token selbst). */
export const antwortGrenze = new RateLimiter({ windowMs: MINUTE_MS, max: 60 });
/** Steuerung (Schritt, Beenden): 120 je Minute und Moderations-Secret (als Hash). */
export const steuerGrenze = new RateLimiter({ windowMs: MINUTE_MS, max: 120 });
