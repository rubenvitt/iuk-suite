import { notFound } from "next/navigation";
import { moduleForHost } from "@/core/registry";
import { resolveHost } from "@/core/routing";

/**
 * Der Host-Riegel des Moduls (Vorbild `helfer/_lib/host.ts`). Die Middleware riegelt hier schon über
 * `requiresAuth`, aber `/m/fahrzeuge/*` ist auf jedem Suite-Host erreichbar — und die Navigation mit
 * ihren Pfaden in der äußeren Form gehört an den Modul-Host.
 */
export function istFahrzeugeHost(headers: Headers): boolean {
  return moduleForHost(resolveHost(headers))?.key === "fahrzeuge";
}

/** Für Layouts und Seiten, als erste Anweisung. notFound statt 403: die Existenz des Pfads bleibt verborgen. */
export function requireFahrzeugeHost(headers: Headers): void {
  if (!istFahrzeugeHost(headers)) notFound();
}
