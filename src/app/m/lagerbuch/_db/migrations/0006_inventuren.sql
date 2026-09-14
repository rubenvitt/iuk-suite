-- DRK-299: Inventurlaeufe mit allen gezaehlten Positionen.
--
-- HANDGESCHRIEBEN, NICHT GENERIERT: `drizzle-kit generate` kennt die Audit-Trigger
-- aus 0004 nicht (vgl. Kopf von 0005).
--
-- Beide Tabellen sind append-only wie `buchungen` (0001) und auditiert wie
-- `buchungen` (0004). Die Lauf-ID ist die ID in `buchungen.referenz = 'inventur:<id>'`.
CREATE TABLE `inventuren` (
	`id` text PRIMARY KEY NOT NULL,
	`ts` integer NOT NULL,
	`quelle_typ` text NOT NULL,
	`quelle_id` text NOT NULL,
	`kommentar` text NOT NULL,
	`umfang` text
);
--> statement-breakpoint
CREATE TABLE `inventur_positionen` (
	`id` text PRIMARY KEY NOT NULL,
	`inventur_id` text NOT NULL,
	`artikel_id` text NOT NULL,
	`charge_id` text,
	`erwartet` integer NOT NULL,
	`gezaehlt` integer NOT NULL,
	FOREIGN KEY (`inventur_id`) REFERENCES `inventuren`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`artikel_id`) REFERENCES `artikel`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`charge_id`) REFERENCES `chargen`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_inventur_positionen_lauf` ON `inventur_positionen` (`inventur_id`);
--> statement-breakpoint
CREATE TRIGGER inventuren_no_update BEFORE UPDATE ON inventuren
BEGIN
  SELECT RAISE(ABORT, 'inventuren ist append-only');
END;
--> statement-breakpoint
CREATE TRIGGER inventuren_no_delete BEFORE DELETE ON inventuren
BEGIN
  SELECT RAISE(ABORT, 'inventuren ist append-only');
END;
--> statement-breakpoint
CREATE TRIGGER inventur_positionen_no_update BEFORE UPDATE ON inventur_positionen
BEGIN
  SELECT RAISE(ABORT, 'inventur_positionen ist append-only');
END;
--> statement-breakpoint
CREATE TRIGGER inventur_positionen_no_delete BEFORE DELETE ON inventur_positionen
BEGIN
  SELECT RAISE(ABORT, 'inventur_positionen ist append-only');
END;
--> statement-breakpoint
CREATE TRIGGER audit_inventuren_create AFTER INSERT ON "inventuren"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'lagerbuch', 'create', 'inventuren', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_inventuren_update AFTER UPDATE ON "inventuren"
WHEN OLD."id" IS NOT NEW."id" OR OLD."ts" IS NOT NEW."ts" OR OLD."quelle_typ" IS NOT NEW."quelle_typ" OR OLD."quelle_id" IS NOT NEW."quelle_id" OR OLD."kommentar" IS NOT NEW."kommentar" OR OLD."umfang" IS NOT NEW."umfang"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'lagerbuch', 'update', 'inventuren', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_inventuren_delete AFTER DELETE ON "inventuren"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'lagerbuch', 'delete', 'inventuren', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_inventur_positionen_create AFTER INSERT ON "inventur_positionen"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'lagerbuch', 'create', 'inventur_positionen', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_inventur_positionen_update AFTER UPDATE ON "inventur_positionen"
WHEN OLD."id" IS NOT NEW."id" OR OLD."inventur_id" IS NOT NEW."inventur_id" OR OLD."artikel_id" IS NOT NEW."artikel_id" OR OLD."charge_id" IS NOT NEW."charge_id" OR OLD."erwartet" IS NOT NEW."erwartet" OR OLD."gezaehlt" IS NOT NEW."gezaehlt"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'lagerbuch', 'update', 'inventur_positionen', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_inventur_positionen_delete AFTER DELETE ON "inventur_positionen"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'lagerbuch', 'delete', 'inventur_positionen', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
