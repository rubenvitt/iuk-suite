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
CREATE TRIGGER audit_services_create AFTER INSERT ON "services"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'portal', 'create', 'services', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_services_update AFTER UPDATE ON "services"
WHEN OLD."id" IS NOT NEW."id" OR OLD."slug" IS NOT NEW."slug" OR OLD."name" IS NOT NEW."name" OR OLD."description" IS NOT NEW."description" OR OLD."url" IS NOT NEW."url" OR OLD."icon_url" IS NOT NEW."icon_url" OR OLD."category" IS NOT NEW."category" OR OLD."tags" IS NOT NEW."tags" OR OLD."required_groups" IS NOT NEW."required_groups" OR OLD."is_public" IS NOT NEW."is_public" OR OLD."is_active" IS NOT NEW."is_active" OR OLD."sort_order" IS NOT NEW."sort_order" OR OLD."open_in_new_tab" IS NOT NEW."open_in_new_tab" OR OLD."created_at" IS NOT NEW."created_at" OR OLD."updated_at" IS NOT NEW."updated_at"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'portal', 'update', 'services', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_services_delete AFTER DELETE ON "services"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'portal', 'delete', 'services', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_portal_einstellungen_create AFTER INSERT ON "portal_einstellungen"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'portal', 'create', 'portal_einstellungen', suite_audit_reference(NEW.schluessel), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_portal_einstellungen_update AFTER UPDATE ON "portal_einstellungen"
WHEN OLD."schluessel" IS NOT NEW."schluessel" OR OLD."wert" IS NOT NEW."wert"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'portal', 'update', 'portal_einstellungen', suite_audit_reference(NEW.schluessel), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_portal_einstellungen_delete AFTER DELETE ON "portal_einstellungen"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'portal', 'delete', 'portal_einstellungen', suite_audit_reference(OLD.schluessel), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
