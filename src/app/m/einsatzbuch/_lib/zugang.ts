import { notFound, redirect } from "next/navigation";
import { auditActor, auditDenied, auditLoginRequired } from "@/core/audit/server";
import { auth } from "@/core/auth";
import { hasAnyGroup } from "@/core/groups";
import { getModule, requiredGroupsFor } from "@/core/registry";

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
