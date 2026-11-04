import type { AuditActor, AuditEventInput, AuditModule } from "./types";
import { withAuditContext } from "./context";
import { recordAuditEvent } from "./storage";
export { withAuditContext } from "./context";

/** Only call with an identity already confirmed by the existing server guard. */
export function auditActor(viewer: { sub?: string | null; id?: string | null; name?: string | null } | null | undefined): AuditActor {
  const id = viewer?.sub ?? viewer?.id;
  return id ? { kind: "user", id, ...(viewer?.name ? { name: viewer.name.slice(0, 256) } : {}) } : { kind: "anonymous" };
}
/** A shared credential identifies access, never an individual. No code or label from input. */
export function auditAccessActor(module: "lagerbuch" | "radio" | "verpflegung", id: string): AuditActor {
  const art = module === "radio" ? "code" : module === "verpflegung" ? "link" : "token";
  return { kind: "access", id: `${module}:${art}:${id}`, name: module === "verpflegung" ? "Helfer-Link" : "Gemeinsamer Zugangscode" };
}
export function auditParticipantActor(id: string): AuditActor {
  return { kind: "user", id: `uav:participant:${id}` };
}
/** Explicit events must never alter an authorization, logout or delivery outcome. */
export function auditEvent(event: AuditEventInput, actor?: AuditActor): void {
  try {
    if (actor) withAuditContext({ actor }, () => recordAuditEvent(event));
    else recordAuditEvent(event);
  } catch {
    console.error("[audit] Ereignis konnte nicht gespeichert werden.");
  }
}
/**
 * No session at a guard is NOT audited (2026-11-04, Ruben): an unauthenticated hit on a
 * module page is the way to the login, not a refused person — every crawler, link preview,
 * expired session and first navigation wrote "Zugriff verweigert · Modulzugriff ohne
 * Anmeldung". Guards redirect (or answer 401) silently; `auditDenied` stays for a signed-in
 * person without the right group and for wrong codes/tokens. Old `login_required` /
 * `access_throttled` rows keep their labels in `portal/admin/audit/labels.ts`.
 */
export function auditDenied(module: AuditModule, actor: AuditActor = { kind: "anonymous" }, objectType = "access"): void {
  auditEvent({ module, action: "access_denied", objectType, result: "denied", origin: "server" }, actor);
}
export function auditSystem<T>(operation: () => T): T {
  return withAuditContext({ actor: { kind: "system" } }, operation);
}

/**
 * Success means a prepared response; receipt by the client is unobservable.
 * The operation calls target(rawId) only after resolving the object on the server.
 * Collection exports use a fixed collection reference. Storage hashes the raw reference;
 * never pass a filename, URL, body, or an already hashed value.
 */
export async function auditDelivery(
  module: AuditModule,
  action: "download" | "export",
  objectType: string,
  actor: AuditActor,
  operation: (target: (objectRef: string) => void) => Response | Promise<Response>,
): Promise<Response> {
  return withAuditContext({ actor }, async () => {
    let objectRef: string | undefined;
    try {
      const response = await operation(raw => { objectRef = raw; });
      if (response.status === 401 || response.status === 403) auditDenied(module, actor, objectType);
      if (response.ok || response.status === 401 || response.status === 403 || response.status >= 500) {
        auditEvent({ module, action, objectType, objectRef, origin: "server", result: response.ok ? "success" : response.status < 500 ? "denied" : "failure" });
      }
      return response;
    } catch (error) {
      // Authorization redirects/notFound are handled by the existing guard before this boundary.
      auditEvent({ module, action, objectType, objectRef, origin: "server", result: "failure" });
      throw error;
    }
  });
}
