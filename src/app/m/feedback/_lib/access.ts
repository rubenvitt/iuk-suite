import { getModule } from "@/core/registry";
import { adminGroupsFor } from "@/core/groups";

// `groups` = Suite-Gruppen (Admin-Frage), `fachgruppen` = Slugs der Gruppen, für
// die die Person Gruppenleitung ist. Letzteres gewährt NICHTS für sich: es wird
// ausschließlich in memberGroupIdsFor gegen groups.slug aufgelöst.
export type Viewer = { sub: string; groups: string[]; fachgruppen: string[] };

/**
 * BEWUSST NICHT `isModuleAdmin` — und das ist der einzige Unterschied zu jedem
 * anderen Modul der Suite.
 *
 * `isModuleAdmin` (core/groups) lässt den SUITE-Admin (`ADMIN_GROUP`, Vorgabe
 * `dashboard-admins`) durch: „ist Betreiber" heißt dort automatisch „darf jedes
 * Modul verwalten". Für `feedback` gilt das seit 2026-07-28 nicht mehr. Der
 * Grund ist fachlich, nicht technisch: Admin bedeutet hier Einblick in die
 * Rückmeldungen ALLER Gruppen — `accessibleGroupFilter` gibt `"all"` zurück —
 * und wer den Server betreibt, hat damit noch keinen Anlass, die Bewertungen
 * fremder Dienstabende zu lesen. Betrieb und Einsicht sind zwei Rollen.
 *
 * Wer feedback verwalten soll, gehört also in `da-feedback-admin` (bzw. in das,
 * was `SUITE_ADMIN_GROUP_FEEDBACK` benennt) — auch der Betreiber selbst. Das ist
 * eine Aussage über DIESES Modul: `qr`, `portal` und die kommenden Module
 * behalten die Suite-Admin-Abkürzung, solange niemand dasselbe für sie
 * entscheidet.
 *
 * FOLGE FÜR DEN ZUGANG, nicht nur für die Rechte: `requireFeedbackAccess` fragt
 * diese Funktion mit — ein Suite-Admin ohne Feedback-Gruppe bekommt auf
 * `/m/feedback` jetzt einen 404, keine leere Gruppenliste.
 */
export function isFeedbackAdmin(viewer: Viewer | null): boolean {
  if (!viewer) return false;
  const erlaubt = adminGroupsFor(getModule("feedback"));
  return viewer.groups.some((g) => erlaubt.includes(g));
}

/**
 * DIE zentrale Ownership-Guard gegen die Alt-IDOR. `memberGroupIds` kommt aus
 * user_groups (im Aufrufer via memberGroupIdsFor geladen) — hier reingereicht,
 * damit die Guard rein/testbar bleibt. Jede Route/Action mit group/evening/
 * survey-id MUSS sie aufrufen (evening/survey vorher auf group_id auflösen).
 */
export function assertGroupAccess(
  viewer: Viewer | null,
  groupId: number,
  memberGroupIds: number[],
): void {
  if (isFeedbackAdmin(viewer)) return;
  if (viewer && memberGroupIds.includes(groupId)) return;
  throw new Error("Forbidden");
}

export function accessibleGroupFilter(
  viewer: Viewer | null,
  memberGroupIds: number[],
): "all" | number[] {
  if (isFeedbackAdmin(viewer)) return "all";
  if (!viewer) return [];
  return memberGroupIds;
}
