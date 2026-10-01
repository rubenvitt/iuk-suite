import { notFound } from "next/navigation";
import { moduleForHost } from "@/core/registry";
import { resolveHost } from "@/core/routing";

/**
 * Der Host-Riegel (Vorbild `einsatzbuch/_lib/host.ts`): `decideRoute` bedient `/m/kommplan/*` auf
 * jedem Suite-Host, und `canAccess` steigt bei `requiresAuth: false` sofort aus. Ohne diesen Riegel
 * wäre das Modul über jeden Host erreichbar.
 */
export function istKommplanHost(headers: Headers): boolean {
  return moduleForHost(resolveHost(headers))?.key === "kommplan";
}

/** Für Layouts und Seiten, als erste Anweisung. notFound statt 403: die Existenz des Pfads bleibt verborgen. */
export function requireKommplanHost(headers: Headers): void {
  if (!istKommplanHost(headers)) notFound();
}
