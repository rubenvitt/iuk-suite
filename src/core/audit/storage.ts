import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { openModuleDatabase, moduleDbPath } from "@/core/db";
import { AUDIT_ACTIONS, AUDIT_MODULES, AUDIT_ORIGINS, AUDIT_RESULTS, type AuditEvent, type AuditEventInput, type AuditFilters, type AuditPage } from "./types";
import { currentAuditContext, safeAuditReference, validateAuditActor } from "./context";
import { auditCutoff } from "./retention";

export function withAuditDatabase<T>(operation: (db: Database.Database) => T): T {
  const db = openModuleDatabase(moduleDbPath("audit"));
  try { return operation(db); } finally { db.close(); }
}
export interface AuditRow { id: string; occurred_at: number; module: AuditEvent["module"]; action: AuditEvent["action"]; object_type: string; object_ref: string | null; actor: string; result: AuditEvent["result"]; origin: AuditEvent["origin"]; correlation_id: string | null }
export const AUDIT_COLUMNS = "id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id";
export function insertAuditRow(db: Database.Database, row: AuditRow): void {
  db.prepare(`INSERT INTO audit_events (${AUDIT_COLUMNS}) VALUES (@id, @occurred_at, @module, @action, @object_type, @object_ref, @actor, @result, @origin, @correlation_id) ON CONFLICT(id) DO NOTHING`).run(row);
}
function eventFromRow(row: AuditRow): AuditEvent {
  return { id: row.id, occurredAt: row.occurred_at, module: row.module, action: row.action, objectType: row.object_type,
    ...(row.object_ref !== null ? { objectRef: row.object_ref } : {}), actor: validateAuditActor(JSON.parse(row.actor)), result: row.result, origin: row.origin,
    ...(row.correlation_id !== null ? { correlationId: row.correlation_id } : {}) };
}
export function recordAuditEvent(event: AuditEventInput): void {
  if (!AUDIT_MODULES.includes(event.module) || !AUDIT_ACTIONS.includes(event.action) || !AUDIT_RESULTS.includes(event.result) || !AUDIT_ORIGINS.includes(event.origin) || !/^[a-z][a-z0-9_]{0,63}$/.test(event.objectType)) throw new Error("Invalid audit event");
  if (event.objectRef !== undefined && (typeof event.objectRef !== "string" || event.objectRef.length > 4096)) throw new Error("Invalid audit reference");
  const feedback = event.module === "feedback" && event.objectType === "responses";
  const context = feedback ? { actor: { kind: "anonymous" as const } } : currentAuditContext();
  const row: AuditRow = { id: randomUUID(), occurred_at: Date.now(), module: event.module, action: event.action, object_type: event.objectType,
    object_ref: feedback || event.objectRef === undefined ? null : safeAuditReference(event.objectRef), actor: JSON.stringify(context.actor), result: event.result, origin: event.origin, correlation_id: "correlationId" in context ? context.correlationId ?? null : null };
  withAuditDatabase(db => insertAuditRow(db, row));
}
/** Internal server storage: callers enforce suite-admin access before invoking. */
export function queryAuditEvents(filters: AuditFilters = {}): AuditPage {
  const limit = filters.limit ?? 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Invalid audit page size");
  if ((filters.module !== undefined && !AUDIT_MODULES.includes(filters.module)) || (filters.action !== undefined && !AUDIT_ACTIONS.includes(filters.action)) || (filters.result !== undefined && !AUDIT_RESULTS.includes(filters.result))) throw new Error("Invalid audit filter");
  for (const time of [filters.from, filters.to, filters.cursor?.occurredAt]) if (time !== undefined && (!Number.isSafeInteger(time) || time < 0)) throw new Error("Invalid audit time");
  if (filters.from !== undefined && filters.to !== undefined && filters.from > filters.to) throw new Error("Invalid audit range");
  if (filters.actorId !== undefined && (typeof filters.actorId !== "string" || filters.actorId.length > 512)) throw new Error("Invalid audit actor filter");
  if (filters.objectRef !== undefined && (typeof filters.objectRef !== "string" || filters.objectRef.length > 4096)) throw new Error("Invalid audit reference filter");
  if (filters.objectRefHash !== undefined && (typeof filters.objectRefHash !== "string" || !/^[a-f0-9]{64}$/.test(filters.objectRefHash) || filters.objectRef !== undefined)) throw new Error("Invalid audit reference hash");
  if (filters.objectType !== undefined && (typeof filters.objectType !== "string" || !/^[a-z][a-z0-9_]{0,63}$/.test(filters.objectType))) throw new Error("Invalid audit object type");
  if (filters.objectRefHash !== undefined && (filters.module === undefined || filters.objectType === undefined)) throw new Error("Incomplete audit object scope");
  if (filters.cursor && !/^[0-9a-f-]{36}$/i.test(filters.cursor.id)) throw new Error("Invalid audit cursor");
  const clauses = ["occurred_at >= ?"]; const params: (string | number)[] = [auditCutoff()];
  if (filters.excludeSystem) clauses.push("json_extract(actor, '$.kind') != 'system'");
  for (const [column, value] of [["module", filters.module], ["object_type", filters.objectType], ["action", filters.action], ["json_extract(actor, '$.id')", filters.actorId], ["result", filters.result], ["object_ref", filters.objectRefHash !== undefined ? "sha256:" + filters.objectRefHash : filters.objectRef === undefined ? undefined : safeAuditReference(filters.objectRef)]] as const) {
    if (value !== undefined) { clauses.push(`${column} = ?`); params.push(value); }
  }
  if (filters.from !== undefined) { clauses.push("occurred_at >= ?"); params.push(filters.from); }
  if (filters.to !== undefined) { clauses.push("occurred_at <= ?"); params.push(filters.to); }
  if (filters.cursor) { clauses.push("(occurred_at < ? OR (occurred_at = ? AND id < ?))"); params.push(filters.cursor.occurredAt, filters.cursor.occurredAt, filters.cursor.id); }
  return withAuditDatabase(db => {
    const rows = db.prepare(`SELECT ${AUDIT_COLUMNS} FROM audit_events WHERE ${clauses.join(" AND ")} ORDER BY occurred_at DESC, id DESC LIMIT ?`).all(...params, limit + 1) as AuditRow[];
    const events = rows.slice(0, limit).map(eventFromRow); const last = events.at(-1);
    return { events, ...(rows.length > limit && last ? { nextCursor: { occurredAt: last.occurredAt, id: last.id } } : {}) };
  });
}
