import { notFound } from "next/navigation";
import { getModule, moduleForHost, prodHostsFor } from "@/core/registry";
import { resolveHost } from "@/core/routing";

/**
 * Der Host-Riegel des Moduls (Vorbild `lagemonitor/_lib/host.ts`). `requiresAuth: false` lässt die
 * Middleware sofort durch — ohne diesen Riegel wäre `/m/gemeinschaft/*` über jeden Suite-Host erreichbar.
 */
export function istGemeinschaftHost(headers: Headers): boolean {
  return moduleForHost(resolveHost(headers))?.key === "gemeinschaft";
}

/** Für Layouts und Seiten, als erste Anweisung. notFound statt 403: die Existenz des Pfads bleibt verborgen. */
export function requireGemeinschaftHost(headers: Headers): void {
  if (!istGemeinschaftHost(headers)) notFound();
}

/** Für Route Handler: erste Anweisung, `const ab = hostAbweisung(req); if (ab) return ab;`. */
export function hostAbweisung(req: Request): Response | null {
  return istGemeinschaftHost(new Headers(req.headers)) ? null : new Response("Not found", { status: 404 });
}

/**
 * Wohin der Login zurückkehrt: absolut, auf den Host des Moduls (Vorbild `lagerbuch/_lib/zugang.ts`,
 * `verwaltungsZiel`). Ein relatives Ziel landet nach der Anmeldung auf dem Portal-Host, weil `AUTH_URL`
 * suiteweit gilt, und dort antwortet der Host-Riegel mit 404. Protokoll und Port kommen aus dem Request,
 * sonst bricht der Rückweg in Dev/E2E still. Der angefragte Host zählt nur, wenn er belegt dieses Modul
 * ist (kein offener Redirector); sonst der erste Prod-Host.
 */
export function anmeldeZiel(headers: Headers, pfad: string): string {
  const angefragt = resolveHost(headers);
  const host = istGemeinschaftHost(headers) ? angefragt.split(":")[0] : prodHostsFor(getModule("gemeinschaft"))[0];
  if (!host) return `/m/gemeinschaft${pfad === "/" ? "" : pfad}`;
  const proto = headers.get("x-forwarded-proto")?.split(",")[0].trim() || "http";
  const port = angefragt.split(":")[1];
  return `${proto}://${host}${port ? `:${port}` : ""}${pfad}`;
}

/** Der Login-Link mit Rückweg auf `pfad` (äußerer Pfad auf dem Modul-Host, etwa `/` oder `/bar`). */
export function anmeldeHref(headers: Headers, pfad: string): string {
  return `/login?callbackUrl=${encodeURIComponent(anmeldeZiel(headers, pfad))}`;
}
