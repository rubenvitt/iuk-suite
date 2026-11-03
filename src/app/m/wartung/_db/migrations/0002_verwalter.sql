-- IDA-337: Verwalter einer Gruppe ordnet der Admin im Modul zu, nicht mehr eine Pocket-ID-Gruppe je Gruppe.
-- Der UPDATE-Trigger von `gruppe` nennt `pocket_gruppe` und muss vor dem DROP COLUMN weg (SQLite verweigert
-- sonst); er kommt ohne die Spalte wieder.
CREATE TABLE `person` (
	`nutzer` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `verwalter` (
	`gruppe_id` text NOT NULL,
	`nutzer` text NOT NULL,
	`name` text NOT NULL,
	`angelegt_am` integer NOT NULL,
	PRIMARY KEY(`gruppe_id`, `nutzer`),
	FOREIGN KEY (`gruppe_id`) REFERENCES `gruppe`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `verwalter_nutzer_idx` ON `verwalter` (`nutzer`);--> statement-breakpoint
DROP TRIGGER `audit_gruppe_update`;--> statement-breakpoint
DROP INDEX `gruppe_pocket_idx`;--> statement-breakpoint
ALTER TABLE `gruppe` DROP COLUMN `pocket_gruppe`;--> statement-breakpoint
CREATE TRIGGER audit_gruppe_update AFTER UPDATE ON "gruppe"
WHEN OLD."id" IS NOT NEW."id" OR OLD."name" IS NOT NEW."name" OR OLD."position" IS NOT NEW."position" OR OLD."angelegt_am" IS NOT NEW."angelegt_am" OR OLD."aktualisiert_am" IS NOT NEW."aktualisiert_am"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'wartung', 'update', 'gruppe', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_verwalter_create AFTER INSERT ON "verwalter"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'wartung', 'create', 'verwalter', suite_audit_reference(json_array(NEW.gruppe_id,NEW.nutzer)), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_verwalter_update AFTER UPDATE ON "verwalter"
WHEN OLD."gruppe_id" IS NOT NEW."gruppe_id" OR OLD."nutzer" IS NOT NEW."nutzer" OR OLD."name" IS NOT NEW."name" OR OLD."angelegt_am" IS NOT NEW."angelegt_am"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'wartung', 'update', 'verwalter', suite_audit_reference(json_array(NEW.gruppe_id,NEW.nutzer)), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_verwalter_delete AFTER DELETE ON "verwalter"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'wartung', 'delete', 'verwalter', suite_audit_reference(json_array(OLD.gruppe_id,OLD.nutzer)), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
