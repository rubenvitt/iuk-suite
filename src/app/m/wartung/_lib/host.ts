import { notFound } from "next/navigation";
import { moduleForHost } from "@/core/registry";
import { resolveHost } from "@/core/routing";

/**
 * Der Host-Riegel des Moduls (Vorbild `helfer/_lib/host.ts`). Die Middleware riegelt hier schon über
 * `requiresAuth`, aber `/m/wartung/*` ist auf jedem Suite-Host erreichbar — und die Navigation mit
 * ihren Pfaden in der äußeren Form gehört an den Modul-Host.
 */
export function istWartungHost(headers: Headers): boolean {
  return moduleForHost(resolveHost(headers))?.key === "wartung";
}

/** Für Layouts und Seiten, als erste Anweisung. notFound statt 403: die Existenz des Pfads bleibt verborgen. */
export function requireWartungHost(headers: Headers): void {
  if (!istWartungHost(headers)) notFound();
}

/** Für Route Handler: erste Anweisung, `const ab = hostAbweisung(req); if (ab) return ab;`. */
export function hostAbweisung(req: Request): Response | null {
  return istWartungHost(new Headers(req.headers)) ? null : new Response("Not found", { status: 404 });
}
