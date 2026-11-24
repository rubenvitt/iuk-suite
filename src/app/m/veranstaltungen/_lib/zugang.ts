import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { Session } from "next-auth";
import { auditActor, auditDenied } from "@/core/audit/server";
import { auth } from "@/core/auth";
import { hasAnyGroup, isModuleAdmin } from "@/core/groups";
import { getModule, requiredGroupsFor } from "@/core/registry";
import { istVeranstaltungenHost } from "./host";

export type Viewer = Session["user"];
type EnvLike = Record<string, string | undefined>;

/**
 * Zugang über die Zugangsgruppen (`SUITE_ACCESS_GROUP_VERANSTALTUNGEN`, Vorgabe `veranstaltungen-nutzer` und
 * `veranstaltungen-admin`) — dieselbe Liste wie in der Middleware (`canAccess`). Wer Zugang hat, pflegt:
 * Veranstaltungen sind Teamarbeit, eine zweite Stufe „nur ansehen“ gibt es bewusst nicht.
 */
export function hatVeranstaltungenZugang(groups: readonly string[] | null | undefined, env: EnvLike = process.env): boolean {
  return hasAnyGroup(groups, requiredGroupsFor(getModule("veranstaltungen"), env));
}

/**
 * Eine Veranstaltung löschen: Zugang UND Modul-Admin (`SUITE_ADMIN_GROUP_VERANSTALTUNGEN`; der Suite-Admin
 * zählt nach `isModuleAdmin` mit, braucht aber den Zugang, sonst ließe ihn schon die Middleware nicht durch).
 */
export function darfVeranstaltungLoeschen(groups: readonly string[] | null | undefined, env: EnvLike = process.env): boolean {
  return hatVeranstaltungenZugang(groups, env) && isModuleAdmin(getModule("veranstaltungen"), groups ? [...groups] : null, env);
}

/**
 * Riegel für Layout UND jede Seite (eine Route Group ist keine Sicherheitsgrenze). Ohne Sitzung →
 * Login, ohne Gruppe → 404; beides mit Audit-Zeile.
 */
export async function requireVeranstaltungenZugang(): Promise<Viewer> {
  const viewer = (await auth())?.user;
  if (!viewer) {
    redirect(`/login?callbackUrl=${encodeURIComponent("/m/veranstaltungen")}`);
  }
  if (!hatVeranstaltungenZugang(viewer.groups)) {
    auditDenied("veranstaltungen", auditActor(viewer));
    notFound();
  }
  return viewer;
}

/** Riegel für Server Actions: Host, Sitzung, Zugang (`admin` zusätzlich Modul-Admin). Wurf statt Umleitung. */
export async function requireVeranstaltungenAktion(admin = false): Promise<Viewer> {
  const kopf = await headers();
  const viewer = (await auth())?.user;
  if (!istVeranstaltungenHost(kopf)) { auditDenied("veranstaltungen", auditActor(viewer)); throw new Error("Forbidden"); }
  if (!viewer) { throw new Error("Forbidden"); }
  const darf = admin ? darfVeranstaltungLoeschen(viewer.groups) : hatVeranstaltungenZugang(viewer.groups);
  if (!darf) { auditDenied("veranstaltungen", auditActor(viewer)); throw new Error("Forbidden"); }
  return viewer;
}

