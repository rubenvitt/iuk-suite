-- LGM-5: Grundbestand des Moduls lagemonitor. Tabellen von drizzle-kit generiert, die Audit-Trigger
-- (je audited Tabelle create/update/delete, AUDIT_TABLES.lagemonitor) von Hand angehängt: drizzle-kit
-- kennt sie nicht. Wer eine Spalte ergänzt, setzt den UPDATE-Trigger in derselben Migration neu.
CREATE TABLE `lagemonitor_anzeige` (
	`id` text PRIMARY KEY NOT NULL,
	`standort_name` text NOT NULL,
	`standort_breite` real NOT NULL,
	`standort_laenge` real NOT NULL,
	`region_ars` text NOT NULL,
	`region_name` text NOT NULL,
	`warnschwelle` text NOT NULL,
	`wetter` integer NOT NULL,
	`radar` integer NOT NULL,
	`warngebiete` integer NOT NULL,
	`warnliste` integer NOT NULL,
	`suchlage` integer NOT NULL,
	`suchlage_adresse` text,
	`suchlage_token` text,
	`suchlage_flugspuren` integer NOT NULL,
	`suchlage_gebiete` integer NOT NULL,
	`suchlage_drohnenbild` integer NOT NULL,
	`aktualisiert_am` integer NOT NULL,
	`aktualisiert_von` text NOT NULL,
	CONSTRAINT "lagemonitor_anzeige_einzeln" CHECK(id = 'anzeige'),
	CONSTRAINT "lagemonitor_anzeige_warnschwelle" CHECK(warnschwelle IN ('Minor','Moderate','Severe','Extreme'))
);
--> statement-breakpoint
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
CREATE TABLE `lagemonitor_zugang` (
	`id` text PRIMARY KEY NOT NULL,
	`bezeichnung` text NOT NULL,
	`schluessel_hash` text NOT NULL,
	`angelegt_am` integer NOT NULL,
	`angelegt_von` text NOT NULL,
	`zuletzt_abgeholt_am` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lagemonitor_zugang_schluessel_idx` ON `lagemonitor_zugang` (`schluessel_hash`);
--> statement-breakpoint
CREATE TRIGGER audit_lagemonitor_anzeige_create AFTER INSERT ON "lagemonitor_anzeige"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'lagemonitor', 'create', 'lagemonitor_anzeige', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_lagemonitor_anzeige_update AFTER UPDATE ON "lagemonitor_anzeige"
WHEN OLD."id" IS NOT NEW."id" OR OLD."standort_name" IS NOT NEW."standort_name" OR OLD."standort_breite" IS NOT NEW."standort_breite" OR OLD."standort_laenge" IS NOT NEW."standort_laenge" OR OLD."region_ars" IS NOT NEW."region_ars" OR OLD."region_name" IS NOT NEW."region_name" OR OLD."warnschwelle" IS NOT NEW."warnschwelle" OR OLD."wetter" IS NOT NEW."wetter" OR OLD."radar" IS NOT NEW."radar" OR OLD."warngebiete" IS NOT NEW."warngebiete" OR OLD."warnliste" IS NOT NEW."warnliste" OR OLD."suchlage" IS NOT NEW."suchlage" OR OLD."suchlage_adresse" IS NOT NEW."suchlage_adresse" OR OLD."suchlage_token" IS NOT NEW."suchlage_token" OR OLD."suchlage_flugspuren" IS NOT NEW."suchlage_flugspuren" OR OLD."suchlage_gebiete" IS NOT NEW."suchlage_gebiete" OR OLD."suchlage_drohnenbild" IS NOT NEW."suchlage_drohnenbild" OR OLD."aktualisiert_am" IS NOT NEW."aktualisiert_am" OR OLD."aktualisiert_von" IS NOT NEW."aktualisiert_von"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'lagemonitor', 'update', 'lagemonitor_anzeige', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_lagemonitor_anzeige_delete AFTER DELETE ON "lagemonitor_anzeige"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'lagemonitor', 'delete', 'lagemonitor_anzeige', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_lagemonitor_zugang_create AFTER INSERT ON "lagemonitor_zugang"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'lagemonitor', 'create', 'lagemonitor_zugang', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_lagemonitor_zugang_update AFTER UPDATE ON "lagemonitor_zugang"
WHEN OLD."id" IS NOT NEW."id" OR OLD."bezeichnung" IS NOT NEW."bezeichnung" OR OLD."schluessel_hash" IS NOT NEW."schluessel_hash" OR OLD."angelegt_am" IS NOT NEW."angelegt_am" OR OLD."angelegt_von" IS NOT NEW."angelegt_von"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'lagemonitor', 'update', 'lagemonitor_zugang', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_lagemonitor_zugang_delete AFTER DELETE ON "lagemonitor_zugang"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'lagemonitor', 'delete', 'lagemonitor_zugang', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
