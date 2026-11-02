-- Fahrzeuge auf der Karte (LGM-10): Tabelle von drizzle-kit, Audit-Trigger von Hand (wie 0006_kategorien.sql).
-- Die Positionsspalten breite, laenge und gemeldet_am stehen bewusst NICHT im WHEN des Update-Triggers
-- (`unauditedColumns` in core/audit/catalog.ts): sonst schriebe jede Abholung eine Audit-Zeile, und das Audit wäre das Bewegungsprofil.
CREATE TABLE `lagemonitor_fahrzeug` (
	`id` text PRIMARY KEY NOT NULL,
	`stamm_id` text NOT NULL,
	`zeichen` text NOT NULL,
	`zugang_id` text,
	`breite` real,
	`laenge` real,
	`gemeldet_am` integer,
	`angelegt_am` integer NOT NULL,
	`angelegt_von` text NOT NULL,
	FOREIGN KEY (`zugang_id`) REFERENCES `lagemonitor_zugang`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lagemonitor_fahrzeug_stamm_idx` ON `lagemonitor_fahrzeug` (`stamm_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `lagemonitor_fahrzeug_zugang_idx` ON `lagemonitor_fahrzeug` (`zugang_id`);--> statement-breakpoint
CREATE TRIGGER audit_lagemonitor_fahrzeug_create AFTER INSERT ON "lagemonitor_fahrzeug"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'lagemonitor', 'create', 'lagemonitor_fahrzeug', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_lagemonitor_fahrzeug_update AFTER UPDATE ON "lagemonitor_fahrzeug"
WHEN OLD."id" IS NOT NEW."id" OR OLD."stamm_id" IS NOT NEW."stamm_id" OR OLD."zeichen" IS NOT NEW."zeichen" OR OLD."zugang_id" IS NOT NEW."zugang_id" OR OLD."angelegt_am" IS NOT NEW."angelegt_am" OR OLD."angelegt_von" IS NOT NEW."angelegt_von"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'lagemonitor', 'update', 'lagemonitor_fahrzeug', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_lagemonitor_fahrzeug_delete AFTER DELETE ON "lagemonitor_fahrzeug"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'lagemonitor', 'delete', 'lagemonitor_fahrzeug', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
