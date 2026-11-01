import { notFound } from "next/navigation";
import { moduleForHost } from "@/core/registry";
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
