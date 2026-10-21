import { notFound } from "next/navigation";
import { moduleForHost } from "@/core/registry";
import { resolveHost } from "@/core/routing";

/**
 * Der Host-Riegel des Moduls (Vorbild `einsatzbuch/_lib/host.ts`). Die Middleware riegelt hier schon
 * über `requiresAuth`, aber `/m/helfer/*` ist auf jedem Suite-Host erreichbar — und die Navigation, die
 * Rücksprungadresse für HiOrg und die Cookies des Verbindens gehören an den Modul-Host.
 */
export function istHelferHost(headers: Headers): boolean {
  return moduleForHost(resolveHost(headers))?.key === "helfer";
}

/** Für Layouts und Seiten, als erste Anweisung. notFound statt 403: die Existenz des Pfads bleibt verborgen. */
export function requireHelferHost(headers: Headers): void {
  if (!istHelferHost(headers)) notFound();
}
