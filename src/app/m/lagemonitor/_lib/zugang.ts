import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { Session } from "next-auth";
import { auditActor, auditDenied, auditLoginRequired } from "@/core/audit/server";
import { auth } from "@/core/auth";
import { isModuleAdmin } from "@/core/groups";
import { getModule } from "@/core/registry";
import { istLagemonitorHost } from "./host";

export type Viewer = Session["user"];
type EnvLike = Record<string, string | undefined>;

/**
 * Die Verwaltung ist das ganze Modul: nur Modul-Admins (`SUITE_ADMIN_GROUP_LAGEMONITOR`, Vorgabe
 * `lagemonitor-admin`; der Suite-Admin zählt nach `isModuleAdmin` mit). Der Lagemonitor selbst kommt
 * nicht über eine Sitzung, sondern mit einem Schlüssel (`api/konfiguration`).
 */
export function darfLagemonitorVerwalten(groups: readonly string[] | null | undefined, env: EnvLike = process.env): boolean {
  return isModuleAdmin(getModule("lagemonitor"), groups ? [...groups] : null, env);
}

/** Riegel für Layout UND Seite (eine Route Group ist keine Sicherheitsgrenze). Ohne Sitzung → Login, ohne Recht → 404. */
export async function requireLagemonitorVerwaltung(): Promise<Viewer> {
  const viewer = (await auth())?.user;
  if (!viewer) {
    auditLoginRequired("lagemonitor");
    redirect(`/login?callbackUrl=${encodeURIComponent("/m/lagemonitor")}`);
  }
  if (!darfLagemonitorVerwalten(viewer.groups)) {
    auditDenied("lagemonitor", auditActor(viewer));
    notFound();
  }
  return viewer;
}

/** Riegel für Server Actions: Host, Sitzung, Verwaltungsrecht. Wurf statt Umleitung. */
export async function requireLagemonitorAktion(): Promise<Viewer> {
  const kopf = await headers();
  const viewer = (await auth())?.user;
  if (!istLagemonitorHost(kopf)) { auditDenied("lagemonitor", auditActor(viewer)); throw new Error("Forbidden"); }
  if (!viewer) { auditLoginRequired("lagemonitor"); throw new Error("Forbidden"); }
  if (!darfLagemonitorVerwalten(viewer.groups)) { auditDenied("lagemonitor", auditActor(viewer)); throw new Error("Forbidden"); }
  return viewer;
}

/** Wer geändert hat, für `aktualisiert_von`/`angelegt_von`. */
export function anzeigeName(viewer: Viewer): string {
  return (viewer.name?.trim() || viewer.id).slice(0, 120);
}
