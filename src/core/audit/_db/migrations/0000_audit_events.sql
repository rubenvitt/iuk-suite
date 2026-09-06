CREATE TABLE audit_events (
  id TEXT PRIMARY KEY NOT NULL,
  occurred_at INTEGER NOT NULL,
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  object_type TEXT NOT NULL,
  object_ref TEXT,
  actor TEXT NOT NULL,
  result TEXT NOT NULL,
  origin TEXT NOT NULL,
  correlation_id TEXT,
  CONSTRAINT audit_events_actor_json CHECK (json_valid(actor))
);
--> statement-breakpoint
CREATE INDEX audit_events_order_idx ON audit_events (occurred_at, id);
--> statement-breakpoint
CREATE INDEX audit_events_module_idx ON audit_events (module, occurred_at, id);
--> statement-breakpoint
CREATE INDEX audit_events_reference_idx ON audit_events (module, object_ref);
--> statement-breakpoint
CREATE INDEX audit_events_actor_idx ON audit_events (json_extract(actor, '$.id'), occurred_at, id);
