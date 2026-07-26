import { getModule } from "@/core/registry";
import { isModuleAdmin } from "@/core/groups";

// `groups` = Suite-Gruppen (Admin-Frage), `fachgruppen` = Slugs der Gruppen, für
// die die Person Gruppenleitung ist. Letzteres gewährt NICHTS für sich: es wird
// ausschließlich in memberGroupIdsFor gegen groups.slug aufgelöst.
export type Viewer = { sub: string; groups: string[]; fachgruppen: string[] };

export function isFeedbackAdmin(viewer: Viewer | null): boolean {
  if (!viewer) return false;
  return isModuleAdmin(getModule("feedback"), viewer.groups);
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
