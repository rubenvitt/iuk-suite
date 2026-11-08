-- IDA-372: Entnehmen und Zurücklegen von Materialkisten. `entnahme` hält je Mitnahme, wer was wann nahm und
-- zurückbrachte; `entnahme_position` die einzelnen Positionen. `geraet.pruefanleitung` ist neu, der UPDATE-Trigger
-- des Geräts braucht die Spalte (`core/audit/catalog.test.ts`). Die Trigger der neuen Tabellen stehen von Hand hier.
CREATE TABLE `entnahme` (
	`id` text PRIMARY KEY NOT NULL,
	`geraet_id` text NOT NULL,
	`nutzer` text NOT NULL,
	`wer` text DEFAULT '' NOT NULL,
	`zweck` text DEFAULT '' NOT NULL,
	`ganz` integer NOT NULL,
	`entnommen_am` integer NOT NULL,
	`zurueck_am` integer,
	`zurueck_wer` text,
	FOREIGN KEY (`geraet_id`) REFERENCES `geraet`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `entnahme_offen_idx` ON `entnahme` (`geraet_id`,`zurueck_am`);--> statement-breakpoint
CREATE TABLE `entnahme_position` (
	`id` text PRIMARY KEY NOT NULL,
	`entnahme_id` text NOT NULL,
	`inhalt_id` text,
	`text` text NOT NULL,
	`menge` integer NOT NULL,
	`zurueck` integer DEFAULT 0 NOT NULL,
	`fehlt` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`entnahme_id`) REFERENCES `entnahme`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`inhalt_id`) REFERENCES `inhalt`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "entnahme_position_menge" CHECK(menge >= 1),
	CONSTRAINT "entnahme_position_zurueck" CHECK(zurueck >= 0 AND zurueck <= menge)
);
--> statement-breakpoint
CREATE INDEX `entnahme_position_entnahme_idx` ON `entnahme_position` (`entnahme_id`);--> statement-breakpoint
CREATE INDEX `entnahme_position_inhalt_idx` ON `entnahme_position` (`inhalt_id`);--> statement-breakpoint
ALTER TABLE `geraet` ADD `pruefanleitung` text DEFAULT '' NOT NULL;--> statement-breakpoint
DROP TRIGGER `audit_geraet_update`;
--> statement-breakpoint
CREATE TRIGGER audit_geraet_update AFTER UPDATE ON "geraet"
WHEN OLD."id" IS NOT NEW."id" OR OLD."gruppe_id" IS NOT NEW."gruppe_id" OR OLD."art_id" IS NOT NEW."art_id" OR OLD."name" IS NOT NEW."name" OR OLD."hersteller" IS NOT NEW."hersteller" OR OLD."typ" IS NOT NEW."typ" OR OLD."seriennr" IS NOT NEW."seriennr" OR OLD."ort_art" IS NOT NEW."ort_art" OR OLD."ort" IS NOT NEW."ort" OR OLD."fahrzeug_id" IS NOT NEW."fahrzeug_id" OR OLD."stunden" IS NOT NEW."stunden" OR OLD."hinweise" IS NOT NEW."hinweise" OR OLD."aktiv" IS NOT NEW."aktiv" OR OLD."angelegt_am" IS NOT NEW."angelegt_am" OR OLD."aktualisiert_am" IS NOT NEW."aktualisiert_am" OR OLD."pruefanleitung" IS NOT NEW."pruefanleitung"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'wartung', 'update', 'geraet', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_entnahme_create AFTER INSERT ON "entnahme"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'wartung', 'create', 'entnahme', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_entnahme_update AFTER UPDATE ON "entnahme"
WHEN OLD."id" IS NOT NEW."id" OR OLD."geraet_id" IS NOT NEW."geraet_id" OR OLD."nutzer" IS NOT NEW."nutzer" OR OLD."wer" IS NOT NEW."wer" OR OLD."zweck" IS NOT NEW."zweck" OR OLD."ganz" IS NOT NEW."ganz" OR OLD."entnommen_am" IS NOT NEW."entnommen_am" OR OLD."zurueck_am" IS NOT NEW."zurueck_am" OR OLD."zurueck_wer" IS NOT NEW."zurueck_wer"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'wartung', 'update', 'entnahme', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_entnahme_delete AFTER DELETE ON "entnahme"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'wartung', 'delete', 'entnahme', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_entnahme_position_create AFTER INSERT ON "entnahme_position"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'wartung', 'create', 'entnahme_position', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_entnahme_position_update AFTER UPDATE ON "entnahme_position"
WHEN OLD."id" IS NOT NEW."id" OR OLD."entnahme_id" IS NOT NEW."entnahme_id" OR OLD."inhalt_id" IS NOT NEW."inhalt_id" OR OLD."text" IS NOT NEW."text" OR OLD."menge" IS NOT NEW."menge" OR OLD."zurueck" IS NOT NEW."zurueck" OR OLD."fehlt" IS NOT NEW."fehlt"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'wartung', 'update', 'entnahme_position', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_entnahme_position_delete AFTER DELETE ON "entnahme_position"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'wartung', 'delete', 'entnahme_position', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
