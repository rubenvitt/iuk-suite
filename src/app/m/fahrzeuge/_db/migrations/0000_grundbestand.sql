-- IDA-255: Grundbestand des Moduls fahrzeuge. Tabellen von drizzle-kit generiert, die Audit-Trigger
-- (je audited Tabelle create/update/delete, AUDIT_TABLES.fahrzeuge) von Hand angehängt: drizzle-kit
-- kennt sie nicht. Wer eine Spalte ergänzt, setzt den UPDATE-Trigger in derselben Migration neu.
CREATE TABLE `audit_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`occurred_at` integer NOT NULL,
	`module` text NOT NULL,
	`action` text NOT NULL,
	`object_type` text NOT NULL,
	`object_ref` text,
	`actor` text NOT NULL,
	`result` text NOT NULL,
	`origin` text NOT NULL,
	`correlation_id` text,
	CONSTRAINT "audit_outbox_actor_json" CHECK(json_valid("audit_outbox"."actor"))
);
--> statement-breakpoint
CREATE INDEX `audit_outbox_occurred_idx` ON `audit_outbox` (`occurred_at`,`id`);--> statement-breakpoint
CREATE TABLE `stammfahrzeug` (
	`id` text PRIMARY KEY NOT NULL,
	`art` text DEFAULT 'fahrzeug' NOT NULL,
	`typ` text NOT NULL,
	`funkrufname` text NOT NULL,
	`funkkenner` text,
	`kennzeichen` text,
	`standort` text NOT NULL,
	`bemerkung` text,
	`aktiv` integer DEFAULT true NOT NULL,
	`angelegt_am` integer NOT NULL,
	`aktualisiert_am` integer NOT NULL,
	CONSTRAINT "stammfahrzeug_art" CHECK(art IN ('fahrzeug','anhaenger'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stammfahrzeug_funkkenner_idx` ON `stammfahrzeug` (`funkkenner`);--> statement-breakpoint
CREATE UNIQUE INDEX `stammfahrzeug_kennzeichen_idx` ON `stammfahrzeug` (`kennzeichen`);--> statement-breakpoint
CREATE TRIGGER audit_stammfahrzeug_create AFTER INSERT ON "stammfahrzeug"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'fahrzeuge', 'create', 'stammfahrzeug', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_stammfahrzeug_update AFTER UPDATE ON "stammfahrzeug"
WHEN OLD."id" IS NOT NEW."id" OR OLD."art" IS NOT NEW."art" OR OLD."typ" IS NOT NEW."typ" OR OLD."funkrufname" IS NOT NEW."funkrufname" OR OLD."funkkenner" IS NOT NEW."funkkenner" OR OLD."kennzeichen" IS NOT NEW."kennzeichen" OR OLD."standort" IS NOT NEW."standort" OR OLD."bemerkung" IS NOT NEW."bemerkung" OR OLD."aktiv" IS NOT NEW."aktiv" OR OLD."angelegt_am" IS NOT NEW."angelegt_am" OR OLD."aktualisiert_am" IS NOT NEW."aktualisiert_am"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'fahrzeuge', 'update', 'stammfahrzeug', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_stammfahrzeug_delete AFTER DELETE ON "stammfahrzeug"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'fahrzeuge', 'delete', 'stammfahrzeug', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
