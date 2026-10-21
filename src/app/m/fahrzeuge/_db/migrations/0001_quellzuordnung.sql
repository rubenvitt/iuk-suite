-- IDA-256: Zuordnung der Fahrzeugzeilen anderer Apps zu Stammfahrzeugen. Tabelle von drizzle-kit, die
-- Audit-Trigger (AUDIT_TABLES.fahrzeuge) von Hand angehängt.
CREATE TABLE `quellzuordnung` (
	`quelle` text NOT NULL,
	`quell_id` text NOT NULL,
	`stamm_id` text,
	`entschieden_am` integer NOT NULL,
	`entschieden_von` text NOT NULL,
	PRIMARY KEY(`quelle`, `quell_id`),
	FOREIGN KEY (`stamm_id`) REFERENCES `stammfahrzeug`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "quellzuordnung_quelle" CHECK(quelle IN ('einsatzbuch','lagerbuch','funkgeraete'))
);
--> statement-breakpoint
CREATE INDEX `quellzuordnung_stamm_idx` ON `quellzuordnung` (`stamm_id`);--> statement-breakpoint
CREATE TRIGGER audit_quellzuordnung_create AFTER INSERT ON "quellzuordnung"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'fahrzeuge', 'create', 'quellzuordnung', suite_audit_reference(json_array(NEW.quelle,NEW.quell_id)), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_quellzuordnung_update AFTER UPDATE ON "quellzuordnung"
WHEN OLD."quelle" IS NOT NEW."quelle" OR OLD."quell_id" IS NOT NEW."quell_id" OR OLD."stamm_id" IS NOT NEW."stamm_id" OR OLD."entschieden_am" IS NOT NEW."entschieden_am" OR OLD."entschieden_von" IS NOT NEW."entschieden_von"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'fahrzeuge', 'update', 'quellzuordnung', suite_audit_reference(json_array(NEW.quelle,NEW.quell_id)), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_quellzuordnung_delete AFTER DELETE ON "quellzuordnung"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'fahrzeuge', 'delete', 'quellzuordnung', suite_audit_reference(json_array(OLD.quelle,OLD.quell_id)), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
