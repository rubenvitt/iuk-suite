import type { AuditActor, AuditEventInput, AuditModule } from "./types";
import { withAuditContext } from "./context";
import { recordAuditEvent } from "./storage";
import { AblehnungsDrossel } from "./drossel";
export { withAuditContext } from "./context";

/** Only call with an identity already confirmed by the existing server guard. */
export function auditActor(viewer: { sub?: string | null; id?: string | null; name?: string | null } | null | undefined): AuditActor {
  const id = viewer?.sub ?? viewer?.id;
  return id ? { kind: "user", id, ...(viewer?.name ? { name: viewer.name.slice(0, 256) } : {}) } : { kind: "anonymous" };
}
/** A shared credential identifies access, never an individual. No code or label from input. */
export function auditAccessActor(module: "lagerbuch" | "radio", id: string): AuditActor {
  return { kind: "access", id: `${module}:${module === "radio" ? "code" : "token"}:${id}`, name: "Gemeinsamer Zugangscode" };
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
export function auditDenied(module: AuditModule, actor: AuditActor = { kind: "anonymous" }, objectType = "access"): void {
  auditEvent({ module, action: "access_denied", objectType, result: "denied", origin: "server" }, actor);
}
/**
 * No session at the guard — a DIFFERENT event than a refused person, and that is
 * why it gets its own object type.
 *
 * `access` means "this person was not allowed": there was a session, the group was
 * missing, and the row carries the person's id. This one means nobody was signed in.
 * It happens on EVERY cookie-less hit on an administrative surface — a crawler on a
 * module host root, a link preview, an expired session, the first navigation before
 * signing in — and until 2026-09-12 it wore the same label as a real denial. The log
 * then read "Zugriff verweigert · Modulzugriff · Anonym", indistinguishable from a
 * person who was turned away, and measurably misleading: one unauthenticated GET on
 * a feedback group page produced two such rows (layout guard plus page guard).
 *
 * Deliberately still recorded, not dropped: a burst of these on a module host is the
 * only trace of a scan. The label is what changes, not the retention.
 *
 * Bundled and capped per module since IDA-263. Measured on production (2026-10-21):
 * 426 rows since 2026-09-12, no scan among them — every row came in PAIRS ~10 ms apart
 * (layout and page guard of one navigation), four parallel fetches of one tab with an
 * expired session wrote eight, and each rollout check (`HEAD /`) wrote one per module.
 * Now: hits within `LOGIN_AUDIT_BUENDEL_MS` of the last written row are the same visit and
 * stay silent; at most `LOGIN_AUDIT_PRO_MIN` rows per module and minute, then ONE
 * `access_throttled` marker — so a scan still shows, at a bounded number of rows.
 */
export const LOGIN_AUDIT_BUENDEL_MS = 2_000;
export const LOGIN_AUDIT_PRO_MIN = 5;
const loginDrosseln = new Map<AuditModule, AblehnungsDrossel>();
export function auditLoginRequired(module: AuditModule): void {
  let drossel = loginDrosseln.get(module);
  if (!drossel) loginDrosseln.set(module, drossel = new AblehnungsDrossel({ max: LOGIN_AUDIT_PRO_MIN, windowMs: 60_000, buendelMs: LOGIN_AUDIT_BUENDEL_MS }));
  const entscheid = drossel.entscheiden();
  if (entscheid === "still") return;
  auditEvent({ module, action: "access_denied", objectType: entscheid === "einzeln" ? "login_required" : "access_throttled", result: "denied", origin: "server" }, { kind: "anonymous" });
}
/** Only for tests: every test starts with fresh windows. */
export function loginDrosselnZuruecksetzen(): void {
  loginDrosseln.clear();
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
