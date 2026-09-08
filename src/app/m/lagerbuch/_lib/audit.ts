import { auditAccessActor } from "@/core/audit/server";
import type { AuditActor } from "@/core/audit/types";
import { verifyHelferSitzung } from "./helferSitzung";
/** A logout remains possible even after expiry or with an invalid cookie. */
export async function logoutActor(cookie: string | undefined): Promise<AuditActor> {
  if (!cookie) return { kind: "anonymous" };
  try {
    const session = await verifyHelferSitzung(cookie);
    return session ? auditAccessActor("lagerbuch", session.tokenId) : { kind: "anonymous" };
  } catch { return { kind: "anonymous" }; }
}
