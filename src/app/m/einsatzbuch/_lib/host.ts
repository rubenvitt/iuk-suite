import { notFound } from "next/navigation";
import { moduleForHost } from "@/core/registry";
import { resolveHost } from "@/core/routing";

/**
 * Der Host-Riegel des Moduls. `decideRoute` bedient `/m/einsatzbuch/*` auf JEDEM Host, der
 * die Suite erreicht, und `canAccess` steigt bei `requiresAuth: false` sofort aus — ohne
 * diesen Riegel wäre das Modul über jeden Suite-Host erreichbar (Vorbild `uav/_lib/host.ts`).
 */
export function istEinsatzbuchHost(headers: Headers): boolean {
  return moduleForHost(resolveHost(headers))?.key === "einsatzbuch";
}

/** Für Layouts und Seiten, als erste Anweisung. notFound statt 403: die Existenz des Pfads bleibt verborgen. */
export function requireEinsatzbuchHost(headers: Headers): void {
  if (!istEinsatzbuchHost(headers)) notFound();
}

export function einsatzbuchHostOderNull(headers: Headers): "einsatzbuch" | null {
  return istEinsatzbuchHost(headers) ? "einsatzbuch" : null;
}
