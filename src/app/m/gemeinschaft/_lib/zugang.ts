import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { Session } from "next-auth";
import { auditActor, auditDenied } from "@/core/audit/server";
import { auth } from "@/core/auth";
import { isModuleAdmin } from "@/core/groups";
import { getModule } from "@/core/registry";
import { anmeldeHref, istGemeinschaftHost } from "./host";

export type Viewer = Session["user"];
type EnvLike = Record<string, string | undefined>;

/**
 * Angemeldet ist nur die Leitung (`SUITE_ADMIN_GROUP_GEMEINSCHAFT`, Vorgabe `gemeinschaft-admin`; der
 * Suite-Admin zählt nach `isModuleAdmin` mit). Mitglieder haben kein Konto, sie kommen über ihren
 * persönlichen Link (`_lib/meinLink.ts`); Bar-Anfragen gehen ohne Anmeldung.
 */
export function istLeitung(groups: readonly string[] | null | undefined, env: EnvLike = process.env): boolean {
  return isModuleAdmin(getModule("gemeinschaft"), groups ? [...groups] : null, env);
}

/** Riegel für Layout UND jede Seite der Leitung (eine Route Group ist keine Sicherheitsgrenze). Ohne Sitzung → Login, ohne Recht → 404. */
export async function requireLeitung(): Promise<Viewer> {
  const viewer = (await auth())?.user;
  if (!viewer) {
    redirect(anmeldeHref(await headers(), "/"));
  }
  if (!istLeitung(viewer.groups)) {
    auditDenied("gemeinschaft", auditActor(viewer));
    notFound();
  }
  return viewer;
}

/** Riegel für Server Actions der Leitung: Host, Sitzung, Recht. Wurf statt Umleitung. */
export async function requireLeitungAktion(): Promise<Viewer> {
  const kopf = await headers();
  const viewer = (await auth())?.user;
  if (!istGemeinschaftHost(kopf)) { auditDenied("gemeinschaft", auditActor(viewer)); throw new Error("Forbidden"); }
  if (!viewer) { throw new Error("Forbidden"); }
  if (!istLeitung(viewer.groups)) { auditDenied("gemeinschaft", auditActor(viewer)); throw new Error("Forbidden"); }
  return viewer;
}

/** Riegel für Server Actions ohne Anmeldung (Bar-Anfrage, Statusseite, persönlicher Link): nur der Host. */
export async function requireGemeinschaftHostAktion(): Promise<void> {
  if (!istGemeinschaftHost(await headers())) throw new Error("Forbidden");
}
