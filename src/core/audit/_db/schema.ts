import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
const columns = () => ({
  id: text("id").primaryKey().notNull(),
  occurredAt: integer("occurred_at").notNull(),
  module: text("module").notNull(),
  action: text("action").notNull(),
  objectType: text("object_type").notNull(),
  objectRef: text("object_ref"),
  actor: text("actor").notNull(),
  result: text("result").notNull(),
  origin: text("origin").notNull(),
  correlationId: text("correlation_id"),
});
/** Re-exported by each source schema, so future Drizzle migrations preserve the outbox. */
export const auditOutbox = sqliteTable("audit_outbox", columns(), t => [
  index("audit_outbox_occurred_idx").on(t.occurredAt, t.id),
  check("audit_outbox_actor_json", sql`json_valid(${t.actor})`),
]);
export const auditEvents = sqliteTable("audit_events", columns(), t => [
  index("audit_events_order_idx").on(t.occurredAt, t.id),
  index("audit_events_module_idx").on(t.module, t.occurredAt, t.id),
  index("audit_events_reference_idx").on(t.module, t.objectRef),
  index("audit_events_actor_idx").on(sql`json_extract(${t.actor}, '$.id')`, t.occurredAt, t.id),
  check("audit_events_actor_json", sql`json_valid(${t.actor})`),
]);
