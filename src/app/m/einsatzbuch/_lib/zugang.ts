import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { Session } from "next-auth";
import { auditActor, auditDenied, auditLoginRequired } from "@/core/audit/server";
import { auth } from "@/core/auth";
import { hasAnyGroup } from "@/core/groups";
import { getModule, requiredGroupsFor } from "@/core/registry";
import { istEinsatzbuchHost } from "./host";

/**
 * `NonNullable<Awaited<ReturnType<typeof auth>>>["user"]` (Brief) scheitert am Typecheck:
 * `auth` aus `NextAuth(fn)` ist überladen (Sitzung/Middleware/Handler-Wrapper), und
 * `ReturnType` löst dabei auf die letzte Überladung auf (`NextMiddleware`), nicht auf die
 * Sitzungs-Signatur. `Session["user"]` (Modulaugmentation in `src/types/next-auth.d.ts`)
 * trifft denselben Typ ohne die Überladung zu durchlaufen.
 */
export type Viewer = Session["user"];

type EnvLike = Record<string, string | undefined>;

/**
 * Zugang zum Einsatzbuch — NUR über die Zugangsgruppe (`requiredGroupsFor`, also mit
 * `SUITE_ACCESS_GROUP_EINSATZBUCH`). Der Suite-Admin kommt bewusst nicht mit: ab Stufe 5
 * gibt dieses Modul die Schlüssel versiegelter Einsätze frei (Spec §2.3).
 */
export function hatEinsatzbuchZugang(groups: readonly string[] | null | undefined, env: EnvLike = process.env): boolean {
  return hasAnyGroup(groups, requiredGroupsFor(getModule("einsatzbuch"), env));
}

/**
 * Riegel für Layout UND jede Seite (eine Route Group ist keine Sicherheitsgrenze).
 * Ohne Sitzung → Login, ohne Gruppe → 404; beides mit Audit-Zeile. Die Aufrufe von
 * `redirect`/`notFound` bleiben hier, damit Seiten keinen Eintrag im
 * Abdeckungsmanifest von `core/audit` brauchen.
 */
export async function requireEinsatzbuchZugang() {
  const session = await auth();
  const viewer = session?.user;
  if (!viewer) {
    auditLoginRequired("einsatzbuch");
    redirect(`/login?callbackUrl=${encodeURIComponent("/m/einsatzbuch")}`);
  }
  if (!hatEinsatzbuchZugang(viewer.groups)) {
    auditDenied("einsatzbuch", auditActor(viewer));
    notFound();
  }
  return viewer;
}

/**
 * Riegel für Server Actions. Actions laufen ohne Layout, deshalb prüft er den Host selbst
 * (erst Host, dann Sitzung, dann Gruppe) und wirft statt umzuleiten.
 */
export async function requireEinsatzbuchAktion(): Promise<Viewer> {
  const kopf = await headers();
  const viewer = (await auth())?.user;
  if (!istEinsatzbuchHost(kopf)) { auditDenied("einsatzbuch", auditActor(viewer)); throw new Error("Forbidden"); }
  if (!viewer) { auditLoginRequired("einsatzbuch"); throw new Error("Forbidden"); }
  if (!hatEinsatzbuchZugang(viewer.groups)) { auditDenied("einsatzbuch", auditActor(viewer)); throw new Error("Forbidden"); }
  return viewer;
}

/** Für Route Handler: NACH `hostAbweisung` rufen. Antwortform statt Wurf (Vorbild `uav/_lib/requireUavAdmin.ts`). */
export async function einsatzbuchZugang(): Promise<{ ok: true; viewer: Viewer } | { ok: false; response: Response }> {
  const viewer = (await auth())?.user;
  if (!viewer) {
    auditLoginRequired("einsatzbuch");
    return { ok: false, response: Response.json({ error: { code: "unauthenticated", message: "Anmeldung erforderlich" } }, { status: 401 }) };
  }
  if (!hatEinsatzbuchZugang(viewer.groups)) {
    auditDenied("einsatzbuch", auditActor(viewer));
    return { ok: false, response: Response.json({ error: { code: "forbidden", message: "Kein Zugang zum Einsatzbuch" } }, { status: 403 }) };
  }
  return { ok: true, viewer };
}

export async function einsatzbuchAbweisung(): Promise<Response | null> {
  const z = await einsatzbuchZugang();
  return z.ok ? null : z.response;
}
