import { notFound } from "next/navigation";
import { moduleForHost } from "@/core/registry";
import { resolveHost } from "@/core/routing";

/**
 * Der Host-Riegel des Moduls (Vorbild `schichtplan/_lib/host.ts`): `/m/unterkunft/*` ist auf jedem
 * Suite-Host erreichbar, die Navigation mit ihren Pfaden gehört aber an den Modul-Host.
 */
export function istUnterkunftHost(headers: Headers): boolean {
  return moduleForHost(resolveHost(headers))?.key === "unterkunft";
}

/** Für Layout und Seite, als erste Anweisung. notFound statt 403: die Existenz des Pfads bleibt verborgen. */
export function requireUnterkunftHost(headers: Headers): void {
  if (!istUnterkunftHost(headers)) notFound();
}
