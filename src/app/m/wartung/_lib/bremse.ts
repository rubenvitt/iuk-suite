/**
 * NOTBREMSE FÜR MELDUNGEN OHNE ANMELDUNG (IDA-337). Einen Mangel darf jeder mit dem QR-Code melden; die Bremse
 * deckelt, was ein Einzelner damit anrichten kann.
 *
 * Nicht nach IP: hinter Tunnel und Host-Umschreibung kommen alle Anfragen an den Modul-Host mit derselben
 * Adresse an, eine Sperre träfe alle zugleich. Stattdessen je Gerät (der QR-Code nennt es) und insgesamt.
 * Prozessspeicher (`core/ratelimit`): nach einem Neustart leer, für eine Notbremse tragbar.
 */
import { RateLimiter } from "@/core/ratelimit";

const jeGeraet = new RateLimiter({ windowMs: 10 * 60_000, max: 5 });
const insgesamt = new RateLimiter({ windowMs: 60 * 60_000, max: 60 });

/** Bucht eine Meldung ohne Anmeldung; `false` heißt: gerade nicht annehmen. */
export function meldungOhneAnmeldungErlaubt(geraetId: string): boolean {
  if (jeGeraet.istGesperrt(geraetId) || insgesamt.istGesperrt("alle")) return false;
  return jeGeraet.check(geraetId) && insgesamt.check("alle");
}
