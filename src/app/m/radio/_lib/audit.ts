import { auditAccessActor } from "@/core/audit/server";
import type { AuditActor } from "@/core/audit/types";
import { verifyAusleihSitzung } from "./ausleihSitzung";
/** A logout remains possible even after expiry or with an invalid cookie. */
export async function logoutActor(cookie: string | undefined): Promise<AuditActor> {
  if (!cookie) return { kind: "anonymous" };
  try {
    const session = await verifyAusleihSitzung(cookie);
    return session ? auditAccessActor("radio", session.codeId) : { kind: "anonymous" };
  } catch { return { kind: "anonymous" }; }
}
