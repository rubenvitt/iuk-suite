// Die Admin-Prüfung liegt seit 19.07.2026 in `core/groups` (isModuleAdmin) —
// sie war hier und in core/auth/index.ts doppelt und hätte sich mit jedem
// weiteren Modul erneut vervielfacht. Hier bleibt nur, was fachlich zum
// Portal gehört: welche Kachel wem sichtbar ist.

import { hasAnyGroup } from "@/core/groups";

interface ServiceLike {
  isPublic: boolean;
  isActive: boolean;
  requiredGroups: string[];
}

export function canViewService(
  userGroups: string[],
  service: ServiceLike
): boolean {
  if (!service.isActive) return false;
  if (service.isPublic) return true;
  return hasAnyGroup(userGroups, service.requiredGroups);
}

export function filterVisibleServices<T extends ServiceLike>(
  userGroups: string[],
  services: T[]
): T[] {
  return services.filter((s) => canViewService(userGroups, s));
}
