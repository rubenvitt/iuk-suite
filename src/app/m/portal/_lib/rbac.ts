const ADMIN_GROUP = process.env.ADMIN_GROUP ?? "dashboard-admins";

export function isAdmin(groups: string[]): boolean {
  return groups.includes(ADMIN_GROUP);
}

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
  return service.requiredGroups.some((g) => userGroups.includes(g));
}

export function filterVisibleServices<T extends ServiceLike>(
  userGroups: string[],
  services: T[]
): T[] {
  return services.filter((s) => canViewService(userGroups, s));
}
