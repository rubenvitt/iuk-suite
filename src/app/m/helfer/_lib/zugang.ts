import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { Session } from "next-auth";
import { auditActor, auditDenied, auditLoginRequired } from "@/core/audit/server";
import { auth } from "@/core/auth";
import { hasAnyGroup, isModuleAdmin } from "@/core/groups";
import { getModule, requiredGroupsFor } from "@/core/registry";
import { istHelferHost } from "./host";

export type Viewer = Session["user"];
type EnvLike = Record<string, string | undefined>;

/**
 * ZUGANG NUR ÜBER DIE ZUGANGSGRUPPE (`SUITE_ACCESS_GROUP_HELFER`), auch für den Suite-Admin — hier
 * liegen Personaldaten, und „darf die Suite betreiben“ heißt nicht „muss die Helferliste sehen“
 * (Erforderlichkeit, Art. 5 Abs. 1 lit. c DSGVO). Dieselbe Linie wie im Einsatzbuch.
 */
export function hatHelferZugang(groups: readonly string[] | null | undefined, env: EnvLike = process.env): boolean {
  return hasAnyGroup(groups, requiredGroupsFor(getModule("helfer"), env));
}

/**
 * Verwalten — abgleichen, freigeben, Quelle wechseln, verbinden, löschen: Zugang UND Modul-Admin
 * (`SUITE_ADMIN_GROUP_HELFER`; der Suite-Admin zählt nach `isModuleAdmin` mit, braucht aber
 * trotzdem die Zugangsgruppe).
 */
export function darfHelferVerwalten(groups: readonly string[] | null | undefined, env: EnvLike = process.env): boolean {
  return hatHelferZugang(groups, env) && isModuleAdmin(getModule("helfer"), groups ? [...groups] : null, env);
}

/**
 * Riegel für Layout UND jede Seite (eine Route Group ist keine Sicherheitsgrenze). Ohne Sitzung →
 * Login, ohne Gruppe → 404; beides mit Audit-Zeile. `redirect`/`notFound` bleiben hier, damit Seiten
 * keinen Eintrag im Abdeckungsmanifest von `core/audit` brauchen.
 */
export async function requireHelferZugang(): Promise<Viewer> {
  const viewer = (await auth())?.user;
  if (!viewer) {
    auditLoginRequired("helfer");
    redirect(`/login?callbackUrl=${encodeURIComponent("/m/helfer")}`);
  }
  if (!hatHelferZugang(viewer.groups)) {
    auditDenied("helfer", auditActor(viewer));
    notFound();
  }
  return viewer;
}

/** Riegel für Server Actions, die schreiben: Host, Sitzung, Verwaltungsrecht. Wurf statt Umleitung. */
export async function requireHelferVerwaltenAktion(): Promise<Viewer> {
  const kopf = await headers();
  const viewer = (await auth())?.user;
  if (!istHelferHost(kopf)) { auditDenied("helfer", auditActor(viewer)); throw new Error("Forbidden"); }
  if (!viewer) { auditLoginRequired("helfer"); throw new Error("Forbidden"); }
  if (!darfHelferVerwalten(viewer.groups)) { auditDenied("helfer", auditActor(viewer)); throw new Error("Forbidden"); }
  return viewer;
}

/** Für Route Handler (Verbinden mit HiOrg): Antwortform statt Wurf. NACH dem Host-Riegel rufen. */
export async function helferVerwaltenZugang(): Promise<{ ok: true; viewer: Viewer } | { ok: false; response: Response }> {
  const viewer = (await auth())?.user;
  if (!viewer) {
    auditLoginRequired("helfer");
    return { ok: false, response: new Response("Anmeldung erforderlich", { status: 401 }) };
  }
  if (!darfHelferVerwalten(viewer.groups)) {
    auditDenied("helfer", auditActor(viewer));
    return { ok: false, response: new Response("Not found", { status: 404 }) };
  }
  return { ok: true, viewer };
}

/** Anzeigename für Protokolle; fällt auf die Kennung zurück, nie auf die E-Mail. */
export function anzeigeName(viewer: Viewer): string {
  return (viewer.name?.trim() || viewer.id).slice(0, 120);
}
