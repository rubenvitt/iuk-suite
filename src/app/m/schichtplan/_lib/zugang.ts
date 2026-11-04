import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { Session } from "next-auth";
import { auditActor, auditDenied } from "@/core/audit/server";
import { auth } from "@/core/auth";
import { hasAnyGroup, isModuleAdmin } from "@/core/groups";
import { getModule, requiredGroupsFor } from "@/core/registry";
import type { SchichtplanDb } from "../_db/client";
import { ladePlanung } from "./daten";
import { istSchichtplanHost } from "./host";
import type { PlanungDTO } from "./typen";

export type Viewer = Session["user"];
type EnvLike = Record<string, string | undefined>;

/**
 * Zugang über die Zugangsgruppen (`SUITE_ACCESS_GROUP_SCHICHTPLAN`, Vorgabe `schichtplan-nutzer` und
 * `schichtplan-admin`) — dieselbe Liste wie in der Middleware (`canAccess`). Wer Zugang hat, plant:
 * eine Planung ist Teamarbeit, eine zweite Stufe „nur ansehen“ gibt es bewusst nicht.
 */
export function hatSchichtplanZugang(groups: readonly string[] | null | undefined, env: EnvLike = process.env): boolean {
  return hasAnyGroup(groups, requiredGroupsFor(getModule("schichtplan"), env));
}

/**
 * Eine ganze Planung löschen: Zugang UND Modul-Admin (`SUITE_ADMIN_GROUP_SCHICHTPLAN`; der Suite-Admin
 * zählt nach `isModuleAdmin` mit, braucht aber den Zugang, sonst ließe ihn schon die Middleware nicht durch).
 */
export function darfPlanungLoeschen(groups: readonly string[] | null | undefined, env: EnvLike = process.env): boolean {
  return hatSchichtplanZugang(groups, env) && isModuleAdmin(getModule("schichtplan"), groups ? [...groups] : null, env);
}

/**
 * Riegel für Layout UND jede Seite (eine Route Group ist keine Sicherheitsgrenze). Ohne Sitzung →
 * Login, ohne Gruppe → 404; beides mit Audit-Zeile.
 */
export async function requireSchichtplanZugang(): Promise<Viewer> {
  const viewer = (await auth())?.user;
  if (!viewer) {
    redirect(`/login?callbackUrl=${encodeURIComponent("/m/schichtplan")}`);
  }
  if (!hatSchichtplanZugang(viewer.groups)) {
    auditDenied("schichtplan", auditActor(viewer));
    notFound();
  }
  return viewer;
}

/** Riegel für Server Actions: Host, Sitzung, Zugang (`admin` zusätzlich Modul-Admin). Wurf statt Umleitung. */
export async function requireSchichtplanAktion(admin = false): Promise<Viewer> {
  const kopf = await headers();
  const viewer = (await auth())?.user;
  if (!istSchichtplanHost(kopf)) { auditDenied("schichtplan", auditActor(viewer)); throw new Error("Forbidden"); }
  if (!viewer) { throw new Error("Forbidden"); }
  const darf = admin ? darfPlanungLoeschen(viewer.groups) : hatSchichtplanZugang(viewer.groups);
  if (!darf) { auditDenied("schichtplan", auditActor(viewer)); throw new Error("Forbidden"); }
  return viewer;
}

/**
 * Die Planung oder ein 404 — für `p/[planId]/layout.tsx` (oberhalb jeder Ladegrenze, Falle 23) und
 * die Seiten darunter. Alle mit Modulzugang sehen alle Planungen: eine Planung ist Teamarbeit.
 */
export function planungOder404(db: SchichtplanDb, planId: string): PlanungDTO {
  const p = ladePlanung(db, planId);
  if (!p) notFound();
  return p;
}
