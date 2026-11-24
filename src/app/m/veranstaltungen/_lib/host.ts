import { notFound } from "next/navigation";
import { moduleForHost } from "@/core/registry";
import { resolveHost } from "@/core/routing";

/**
 * Der Host-Riegel des Moduls (Vorbild `schichtplan/_lib/host.ts`). Die Middleware riegelt hier schon über
 * `requiresAuth`, aber `/m/veranstaltungen/*` ist auf jedem Suite-Host erreichbar — und die Navigation mit
 * ihren Pfaden in der äußeren Form gehört an den Modul-Host.
 */
export function istVeranstaltungenHost(headers: Headers): boolean {
  return moduleForHost(resolveHost(headers))?.key === "veranstaltungen";
}

/** Für Layouts und Seiten, als erste Anweisung. notFound statt 403: die Existenz des Pfads bleibt verborgen. */
export function requireVeranstaltungenHost(headers: Headers): void {
  if (!istVeranstaltungenHost(headers)) notFound();
}
