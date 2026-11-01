import { auditActor, auditDenied, auditLoginRequired } from "@/core/audit/server";
import { auth } from "@/core/auth";
import { istLeitung, type Viewer } from "./zugang";

/**
 * Der Leitungsriegel für Route Handler der Vermietung (Vertrags-PDF). Dieselbe Prüfung wie `requireLeitung`
 * (`_lib/zugang.ts`), nur ohne `redirect`/`notFound`: ein Handler hat kein Layout über sich und antwortet selbst
 * mit 404 — ohne Sitzung genauso wie ohne Recht, damit der Pfad nichts verrät. Den Host prüft der Handler vorher
 * (`hostAbweisung`).
 */
export async function leitungImHandler(): Promise<Viewer | null> {
  const viewer = (await auth())?.user;
  if (!viewer) { auditLoginRequired("gemeinschaft"); return null; }
  if (!istLeitung(viewer.groups)) { auditDenied("gemeinschaft", auditActor(viewer)); return null; }
  return viewer;
}
