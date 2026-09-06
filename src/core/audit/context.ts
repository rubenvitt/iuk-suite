import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { AuditActor, AuditContext } from "./types";

// Share the ALS instance across server bundles and development reloads, never an actor.
const root = globalThis as typeof globalThis & { __suiteAuditContext?: AsyncLocalStorage<AuditContext> };
const context = root.__suiteAuditContext ??= new AsyncLocalStorage<AuditContext>();
export function validateAuditActor(actor: AuditActor): AuditActor {
  if (actor.kind === "anonymous" || actor.kind === "system") return { kind: actor.kind };
  if ((actor.kind !== "user" && actor.kind !== "access") || typeof actor.id !== "string" || !actor.id || actor.id.length > 512) throw new Error("Invalid audit actor");
  if (actor.name !== undefined && (typeof actor.name !== "string" || actor.name.length > 256)) throw new Error("Invalid audit actor name");
  return { kind: actor.kind, id: actor.id, ...(actor.name ? { name: actor.name } : {}) };
}
export function withAuditContext<T>(value: AuditContext, operation: () => T): T {
  if (value.correlationId !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.correlationId)) throw new Error("Invalid audit correlation");
  const actor = Object.freeze(validateAuditActor(value.actor));
  return context.run(Object.freeze({ actor, ...(value.correlationId ? { correlationId: value.correlationId } : {}) }), operation);
}
export function currentAuditContext(): AuditContext { return context.getStore() ?? { actor: { kind: "system" } }; }
/** Irreversible even for IDs which become bearer access references in a future module version. */
export function safeAuditReference(value: string): string {
  return "sha256:" + createHash("sha256").update(value).digest("hex");
}
export function registerAuditFunctions(sqlite: Database.Database): Database.Database {
  sqlite.function("suite_audit_id", () => randomUUID());
  sqlite.function("suite_audit_now", () => Date.now());
  sqlite.function("suite_audit_actor", () => JSON.stringify(currentAuditContext().actor));
  sqlite.function("suite_audit_correlation", () => currentAuditContext().correlationId ?? null);
  sqlite.function("suite_audit_reference", (value) => safeAuditReference(String(value)));
  return sqlite;
}
