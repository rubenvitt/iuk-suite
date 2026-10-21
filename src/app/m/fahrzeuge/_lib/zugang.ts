import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { Session } from "next-auth";
import { auditActor, auditDenied, auditLoginRequired } from "@/core/audit/server";
import { auth } from "@/core/auth";
import { hasAnyGroup, isModuleAdmin } from "@/core/groups";
import { getModule, requiredGroupsFor } from "@/core/registry";
import { istFahrzeugeHost } from "./host";

export type Viewer = Session["user"];
type EnvLike = Record<string, string | undefined>;

/**
 * Zugang über die Zugangsgruppen (`SUITE_ACCESS_GROUP_FAHRZEUGE`, Vorgabe `fahrzeuge-nutzer` und
 * `fahrzeuge-admin`). Anders als im Helferverzeichnis stehen hier keine Personaldaten, deshalb öffnet
 * die Admin-Gruppe allein das Modul schon — dieselbe Liste wie in der Middleware (`canAccess`).
 */
export function hatFahrzeugeZugang(groups: readonly string[] | null | undefined, env: EnvLike = process.env): boolean {
  return hasAnyGroup(groups, requiredGroupsFor(getModule("fahrzeuge"), env));
}

/**
 * Anlegen, ändern, aktivieren: Zugang UND Modul-Admin (`SUITE_ADMIN_GROUP_FAHRZEUGE`; der Suite-Admin
 * zählt nach `isModuleAdmin` mit, braucht aber den Zugang, sonst ließe ihn schon die Middleware nicht durch).
 */
export function darfFahrzeugeVerwalten(groups: readonly string[] | null | undefined, env: EnvLike = process.env): boolean {
  return hatFahrzeugeZugang(groups, env) && isModuleAdmin(getModule("fahrzeuge"), groups ? [...groups] : null, env);
}

/**
 * Riegel für Layout UND jede Seite (eine Route Group ist keine Sicherheitsgrenze). Ohne Sitzung →
 * Login, ohne Gruppe → 404; beides mit Audit-Zeile.
 */
export async function requireFahrzeugeZugang(): Promise<Viewer> {
  const viewer = (await auth())?.user;
  if (!viewer) {
    auditLoginRequired("fahrzeuge");
    redirect(`/login?callbackUrl=${encodeURIComponent("/m/fahrzeuge")}`);
  }
  if (!hatFahrzeugeZugang(viewer.groups)) {
    auditDenied("fahrzeuge", auditActor(viewer));
    notFound();
  }
  return viewer;
}

/** Riegel für Server Actions, die schreiben: Host, Sitzung, Verwaltungsrecht. Wurf statt Umleitung. */
export async function requireFahrzeugeVerwaltenAktion(): Promise<Viewer> {
  const kopf = await headers();
  const viewer = (await auth())?.user;
  if (!istFahrzeugeHost(kopf)) { auditDenied("fahrzeuge", auditActor(viewer)); throw new Error("Forbidden"); }
  if (!viewer) { auditLoginRequired("fahrzeuge"); throw new Error("Forbidden"); }
  if (!darfFahrzeugeVerwalten(viewer.groups)) { auditDenied("fahrzeuge", auditActor(viewer)); throw new Error("Forbidden"); }
  return viewer;
}

/** Wer entschieden hat, für die Zuordnungen des Erstimports (wie `helfer/_lib/zugang.ts`). */
export function anzeigeName(viewer: Viewer): string {
  return (viewer.name?.trim() || viewer.id).slice(0, 120);
}
