import { notFound, redirect } from "next/navigation";
import type { Session } from "next-auth";
import { auditActor, auditDenied, auditLoginRequired } from "@/core/audit/server";
import { auth } from "@/core/auth";
import { hasAnyGroup, isModuleAdmin } from "@/core/groups";
import { getModule, requiredGroupsFor } from "@/core/registry";

export type Viewer = Session["user"];
type EnvLike = Record<string, string | undefined>;

/**
 * Ansehen und Drucken: die Zugangsgruppe (`SUITE_ACCESS_GROUP_KOMMPLAN`) ODER wer das Modul
 * administriert (`isModuleAdmin`, also auch der Suite-Admin — anders als im Einsatzbuch liegt hier
 * nichts, was der Betrieb nicht sehen dürfte).
 */
export function hatKommplanZugang(groups: readonly string[] | null | undefined, env: EnvLike = process.env): boolean {
  const mod = getModule("kommplan");
  return hasAnyGroup(groups, requiredGroupsFor(mod, env)) || isModuleAdmin(mod, groups ? [...groups] : null, env);
}

/** Pläne bearbeiten, Bibliothek pflegen, Links ausstellen (ab Phase 2). */
export function darfKommplanBearbeiten(groups: readonly string[] | null | undefined, env: EnvLike = process.env): boolean {
  return isModuleAdmin(getModule("kommplan"), groups ? [...groups] : null, env);
}

/**
 * Riegel für das Layout der Arbeitsrouten UND jede Seite darunter (eine Route Group ist keine
 * Sicherheitsgrenze). `redirect`/`notFound` bleiben hier, damit Seiten keinen Eintrag im
 * Abdeckungsmanifest von `core/audit` brauchen.
 */
export async function requireKommplanZugang(): Promise<Viewer> {
  const viewer = (await auth())?.user;
  if (!viewer) {
    auditLoginRequired("kommplan");
    redirect(`/login?callbackUrl=${encodeURIComponent("/m/kommplan")}`);
  }
  if (!hatKommplanZugang(viewer.groups)) {
    auditDenied("kommplan", auditActor(viewer));
    notFound();
  }
  return viewer;
}
