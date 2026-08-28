import { notFound } from "next/navigation";
import { moduleForHost } from "@/core/registry";
import { resolveHost } from "@/core/routing";

/** Muster `radio/_lib/host.ts` — siehe dort für die ausführliche Begründung. */
export function istUavHost(headers: Headers): boolean {
  return moduleForHost(resolveHost(headers))?.key === "uav";
}

export function requireUavHost(headers: Headers): void {
  if (!istUavHost(headers)) notFound();
}
