ALTER TABLE `devices` ADD `update_fehler` text;
--> statement-breakpoint
DROP TRIGGER audit_devices_update;
--> statement-breakpoint
CREATE TRIGGER audit_devices_update AFTER UPDATE ON "devices"
WHEN OLD."id" IS NOT NEW."id" OR OLD."rufname" IS NOT NEW."rufname" OR OLD."issi" IS NOT NEW."issi" OR OLD."tei" IS NOT NEW."tei" OR OLD."serial_number" IS NOT NEW."serial_number" OR OLD."device_type" IS NOT NEW."device_type" OR OLD."status" IS NOT NEW."status" OR OLD."location" IS NOT NEW."location" OR OLD."assigned_to" IS NOT NEW."assigned_to" OR OLD."software_version" IS NOT NEW."software_version" OR OLD."last_updated_at" IS NOT NEW."last_updated_at" OR OLD."notes" IS NOT NEW."notes" OR OLD."hiorg_id" IS NOT NEW."hiorg_id" OR OLD."opta" IS NOT NEW."opta" OR OLD."funktion" IS NOT NEW."funktion" OR OLD."hersteller" IS NOT NEW."hersteller" OR OLD."bedieneinheit" IS NOT NEW."bedieneinheit" OR OLD."device_modes" IS NOT NEW."device_modes" OR OLD."alamos_integrated" IS NOT NEW."alamos_integrated" OR OLD."loanable" IS NOT NEW."loanable" OR OLD."update_note" IS NOT NEW."update_note" OR OLD."update_fehler" IS NOT NEW."update_fehler" OR OLD."created_at" IS NOT NEW."created_at" OR OLD."updated_at" IS NOT NEW."updated_at" OR OLD."created_by" IS NOT NEW."created_by" OR OLD."updated_by" IS NOT NEW."updated_by"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'radio', 'update', 'devices', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
