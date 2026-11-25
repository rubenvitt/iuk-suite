// Die öffentliche Beamer-Adresse eines Quiz. Kein "use client" (Falle 6, `CLAUDE.md`).
import { teilnahmeUrlAus } from "@/app/m/feedback/_ui/Teilnahme";

/**
 * `<proto>://<feedback-host>/beamer/<secret>`. Protokoll und Host kommen aus DERSELBEN
 * Herleitung wie die Teilnahme-Adresse auf dem Aushang (`teilnahmeUrlAus`, Begründung dort):
 * aus den Headern, nie aus der Anfrage-URL nach dem Host-Rewrite. Der Proxy schreibt
 * `/beamer/…` auf `/m/feedback/beamer/…` um.
 */
export function beamerUrlAus(headers: Headers, secret: string): string {
  const herkunft = new URL(teilnahmeUrlAus(headers, "x")).origin;
  return `${herkunft}/beamer/${encodeURIComponent(secret)}`;
}
