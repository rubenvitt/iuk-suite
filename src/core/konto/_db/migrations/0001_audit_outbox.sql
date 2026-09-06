CREATE TABLE audit_outbox (
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
  CONSTRAINT audit_outbox_actor_json CHECK (json_valid(actor))
);
--> statement-breakpoint
CREATE INDEX audit_outbox_occurred_idx ON audit_outbox (occurred_at, id);
--> statement-breakpoint
CREATE TRIGGER audit_sitzung_widerruf_create AFTER INSERT ON "sitzung_widerruf"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'konto', 'create', 'sitzung_widerruf', suite_audit_reference(NEW.sub), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_sitzung_widerruf_update AFTER UPDATE ON "sitzung_widerruf"
WHEN OLD."sub" IS NOT NEW."sub" OR OLD."widerrufen_ab" IS NOT NEW."widerrufen_ab" OR OLD."aktualisiert_am" IS NOT NEW."aktualisiert_am"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'konto', 'update', 'sitzung_widerruf', suite_audit_reference(NEW.sub), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_sitzung_widerruf_delete AFTER DELETE ON "sitzung_widerruf"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'konto', 'delete', 'sitzung_widerruf', suite_audit_reference(OLD.sub), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
