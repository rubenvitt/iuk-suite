-- IDA-298: gemeldete Mängel an einem Ort (Schrank, Fahrzeug, Tasche).
--
-- `punkte` traegt die angehakten Punkte als JSON-Text, `fotos` die Anzahl der Bilder unter
-- DATA_DIR/lagerbuch/maengel. `gemeldet_at` vermerkt den Sofort-Push und steht deshalb NICHT im
-- WHEN des Update-Triggers (`core/audit/catalog.ts`, unauditedColumns).
--
-- HANDGESCHRIEBEN, NICHT GENERIERT (vgl. Kopf von 0005).
CREATE TABLE `maengel` (
	`id` text PRIMARY KEY NOT NULL,
	`lagerort_id` text NOT NULL,
	`punkte` text NOT NULL,
	`beschreibung` text,
	`melder_name` text,
	`quelle_typ` text NOT NULL,
	`quelle_id` text NOT NULL,
	`fotos` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`gemeldet_at` integer,
	`erledigt_at` integer,
	`erledigt_von` text,
	`erledigt_vermerk` text,
	FOREIGN KEY (`lagerort_id`) REFERENCES `lagerorte`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_maengel_lagerort` ON `maengel` (`lagerort_id`);
--> statement-breakpoint
CREATE INDEX `idx_maengel_offen` ON `maengel` (`erledigt_at`,`created_at`);
--> statement-breakpoint
CREATE TRIGGER audit_maengel_create AFTER INSERT ON "maengel"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'lagerbuch', 'create', 'maengel', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_maengel_update AFTER UPDATE ON "maengel"
WHEN OLD."id" IS NOT NEW."id" OR OLD."lagerort_id" IS NOT NEW."lagerort_id" OR OLD."punkte" IS NOT NEW."punkte" OR OLD."beschreibung" IS NOT NEW."beschreibung" OR OLD."melder_name" IS NOT NEW."melder_name" OR OLD."quelle_typ" IS NOT NEW."quelle_typ" OR OLD."quelle_id" IS NOT NEW."quelle_id" OR OLD."fotos" IS NOT NEW."fotos" OR OLD."created_at" IS NOT NEW."created_at" OR OLD."erledigt_at" IS NOT NEW."erledigt_at" OR OLD."erledigt_von" IS NOT NEW."erledigt_von" OR OLD."erledigt_vermerk" IS NOT NEW."erledigt_vermerk"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'lagerbuch', 'update', 'maengel', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_maengel_delete AFTER DELETE ON "maengel"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'lagerbuch', 'delete', 'maengel', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
