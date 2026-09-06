import { auth } from "@/core/auth";
import { suiteAdminGroup } from "@/core/groups";
import { auditActor, auditDenied } from "./server";

/** Intentionally independent of module-admin overrides and the presentation isAdmin flag. */
export async function canReadAudit(): Promise<boolean> {
  const session = await auth();
  return session?.user?.groups?.includes(suiteAdminGroup()) === true;
}
export class AuditAccessDenied extends Error {
  constructor() { super("Forbidden"); }
}
/** Every entry to audit reads must pass this guard, including direct HTTP calls. */
export async function requireAuditReader() {
  const session = await auth();
  if (!session?.user?.groups?.includes(suiteAdminGroup())) {
    auditDenied("portal", auditActor(session?.user), "audit_log");
    throw new AuditAccessDenied();
  }
  return session.user;
}
