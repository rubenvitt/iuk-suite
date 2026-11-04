import { notFound } from "next/navigation";
import { moduleForHost } from "@/core/registry";
import { resolveHost } from "@/core/routing";

/**
 * Der Host-Riegel des Moduls (Vorbild `wartung/_lib/host.ts`). `/m/verpflegung/*` ist auf jedem Suite-Host
 * erreichbar, und `requiresAuth: false` lässt die Middleware nichts riegeln — die Helfer-Sitzung ist ein
 * host-gebundenes Cookie, die Navigation nennt Pfade in der äußeren Form. Beides gehört an den Modul-Host.
 */
export function istVerpflegungHost(headers: Headers): boolean {
  return moduleForHost(resolveHost(headers))?.key === "verpflegung";
}

/** Für Layouts und Seiten, als erste Anweisung. notFound statt 403: die Existenz des Pfads bleibt verborgen. */
export function requireVerpflegungHost(headers: Headers): void {
  if (!istVerpflegungHost(headers)) notFound();
}

/** Für Route Handler: erste Anweisung, `const ab = hostAbweisung(req); if (ab) return ab;`. */
export function hostAbweisung(req: Request): Response | null {
  return istVerpflegungHost(new Headers(req.headers)) ? null : new Response("Not found", { status: 404 });
}
