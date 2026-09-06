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
CREATE TRIGGER audit_device_events_create AFTER INSERT ON "device_events"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'radio', 'create', 'device_events', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_device_events_update AFTER UPDATE ON "device_events"
WHEN OLD."id" IS NOT NEW."id" OR OLD."device_id" IS NOT NEW."device_id" OR OLD."field" IS NOT NEW."field" OR OLD."old_value" IS NOT NEW."old_value" OR OLD."new_value" IS NOT NEW."new_value" OR OLD."changed_by" IS NOT NEW."changed_by" OR OLD."changed_at" IS NOT NEW."changed_at" OR OLD."source" IS NOT NEW."source"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'radio', 'update', 'device_events', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_device_events_delete AFTER DELETE ON "device_events"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'radio', 'delete', 'device_events', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_devices_create AFTER INSERT ON "devices"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'radio', 'create', 'devices', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_devices_update AFTER UPDATE ON "devices"
WHEN OLD."id" IS NOT NEW."id" OR OLD."rufname" IS NOT NEW."rufname" OR OLD."issi" IS NOT NEW."issi" OR OLD."tei" IS NOT NEW."tei" OR OLD."serial_number" IS NOT NEW."serial_number" OR OLD."device_type" IS NOT NEW."device_type" OR OLD."status" IS NOT NEW."status" OR OLD."location" IS NOT NEW."location" OR OLD."assigned_to" IS NOT NEW."assigned_to" OR OLD."software_version" IS NOT NEW."software_version" OR OLD."last_updated_at" IS NOT NEW."last_updated_at" OR OLD."notes" IS NOT NEW."notes" OR OLD."hiorg_id" IS NOT NEW."hiorg_id" OR OLD."opta" IS NOT NEW."opta" OR OLD."funktion" IS NOT NEW."funktion" OR OLD."hersteller" IS NOT NEW."hersteller" OR OLD."bedieneinheit" IS NOT NEW."bedieneinheit" OR OLD."device_modes" IS NOT NEW."device_modes" OR OLD."alamos_integrated" IS NOT NEW."alamos_integrated" OR OLD."loanable" IS NOT NEW."loanable" OR OLD."update_note" IS NOT NEW."update_note" OR OLD."created_at" IS NOT NEW."created_at" OR OLD."updated_at" IS NOT NEW."updated_at" OR OLD."created_by" IS NOT NEW."created_by" OR OLD."updated_by" IS NOT NEW."updated_by"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'radio', 'update', 'devices', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_devices_delete AFTER DELETE ON "devices"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'radio', 'delete', 'devices', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_loans_create AFTER INSERT ON "loans"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'radio', 'create', 'loans', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_loans_update AFTER UPDATE ON "loans"
WHEN OLD."id" IS NOT NEW."id" OR OLD."device_id" IS NOT NEW."device_id" OR OLD."snapshot_call_sign" IS NOT NEW."snapshot_call_sign" OR OLD."snapshot_serial_number" IS NOT NEW."snapshot_serial_number" OR OLD."snapshot_device_type" IS NOT NEW."snapshot_device_type" OR OLD."borrower_name" IS NOT NEW."borrower_name" OR OLD."borrowed_at" IS NOT NEW."borrowed_at" OR OLD."returned_at" IS NOT NEW."returned_at" OR OLD."return_note" IS NOT NEW."return_note" OR OLD."zugangscode_id" IS NOT NEW."zugangscode_id" OR OLD."created_at" IS NOT NEW."created_at" OR OLD."updated_at" IS NOT NEW."updated_at"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'radio', 'update', 'loans', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_loans_delete AFTER DELETE ON "loans"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'radio', 'delete', 'loans', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_software_versions_create AFTER INSERT ON "software_versions"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'radio', 'create', 'software_versions', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_software_versions_update AFTER UPDATE ON "software_versions"
WHEN OLD."id" IS NOT NEW."id" OR OLD."value" IS NOT NEW."value" OR OLD."created_at" IS NOT NEW."created_at" OR OLD."created_by" IS NOT NEW."created_by" OR OLD."sort_order" IS NOT NEW."sort_order" OR OLD."is_target" IS NOT NEW."is_target"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'radio', 'update', 'software_versions', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_software_versions_delete AFTER DELETE ON "software_versions"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'radio', 'delete', 'software_versions', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_zugangscodes_create AFTER INSERT ON "zugangscodes"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'radio', 'create', 'zugangscodes', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_zugangscodes_update AFTER UPDATE ON "zugangscodes"
WHEN OLD."id" IS NOT NEW."id" OR OLD."code" IS NOT NEW."code" OR OLD."bezeichnung" IS NOT NEW."bezeichnung" OR OLD."aktiv" IS NOT NEW."aktiv" OR OLD."gesperrt_am" IS NOT NEW."gesperrt_am" OR OLD."gesperrt_von" IS NOT NEW."gesperrt_von" OR OLD."created_at" IS NOT NEW."created_at" OR OLD."created_by" IS NOT NEW."created_by" OR OLD."last_used_at" IS NOT NEW."last_used_at"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'radio', 'update', 'zugangscodes', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_zugangscodes_delete AFTER DELETE ON "zugangscodes"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'radio', 'delete', 'zugangscodes', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
