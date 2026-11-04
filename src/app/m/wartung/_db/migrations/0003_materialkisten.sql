-- IDA-335: Materialkisten. Eine Geräteart mit `kiste` hat je Gerät eine Inhaltsliste (`inhalt`); die Prüfung
-- am Gerät zählt sie durch, und was fehlt, wird ein Mangel mit `fehlt`. Die neuen Spalten an `art` und `mangel`
-- brauchen ihre UPDATE-Trigger neu (`core/audit/catalog.test.ts`).
CREATE TABLE `inhalt` (
	`id` text PRIMARY KEY NOT NULL,
	`geraet_id` text NOT NULL,
	`text` text NOT NULL,
	`soll` integer NOT NULL,
	`bemerkung` text DEFAULT '' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`geraet_id`) REFERENCES `geraet`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "inhalt_soll" CHECK(soll >= 1)
);
--> statement-breakpoint
CREATE INDEX `inhalt_geraet_idx` ON `inhalt` (`geraet_id`,`position`);--> statement-breakpoint
ALTER TABLE `art` ADD `kiste` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `mangel` ADD `fehlt` integer DEFAULT false NOT NULL;--> statement-breakpoint
DROP TRIGGER `audit_art_update`;--> statement-breakpoint
CREATE TRIGGER audit_art_update AFTER UPDATE ON "art"
WHEN OLD."id" IS NOT NEW."id" OR OLD."name" IS NOT NEW."name" OR OLD."einzahl" IS NOT NEW."einzahl" OR OLD."ikone" IS NOT NEW."ikone" OR OLD."stunden_pflicht" IS NOT NEW."stunden_pflicht" OR OLD."position" IS NOT NEW."position" OR OLD."angelegt_am" IS NOT NEW."angelegt_am" OR OLD."aktualisiert_am" IS NOT NEW."aktualisiert_am" OR OLD."kiste" IS NOT NEW."kiste"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'wartung', 'update', 'art', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
DROP TRIGGER `audit_mangel_update`;--> statement-breakpoint
CREATE TRIGGER audit_mangel_update AFTER UPDATE ON "mangel"
WHEN OLD."id" IS NOT NEW."id" OR OLD."geraet_id" IS NOT NEW."geraet_id" OR OLD."text" IS NOT NEW."text" OR OLD."foto" IS NOT NEW."foto" OR OLD."einsatzbereit" IS NOT NEW."einsatzbereit" OR OLD."gemeldet_am" IS NOT NEW."gemeldet_am" OR OLD."gemeldet_von" IS NOT NEW."gemeldet_von" OR OLD."behoben_am" IS NOT NEW."behoben_am" OR OLD."behoben_von" IS NOT NEW."behoben_von" OR OLD."gepusht_am" IS NOT NEW."gepusht_am" OR OLD."fehlt" IS NOT NEW."fehlt"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'wartung', 'update', 'mangel', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_inhalt_create AFTER INSERT ON "inhalt"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'wartung', 'create', 'inhalt', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_inhalt_update AFTER UPDATE ON "inhalt"
WHEN OLD."id" IS NOT NEW."id" OR OLD."geraet_id" IS NOT NEW."geraet_id" OR OLD."text" IS NOT NEW."text" OR OLD."soll" IS NOT NEW."soll" OR OLD."bemerkung" IS NOT NEW."bemerkung" OR OLD."position" IS NOT NEW."position"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'wartung', 'update', 'inhalt', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_inhalt_delete AFTER DELETE ON "inhalt"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'wartung', 'delete', 'inhalt', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
INSERT INTO art (id, name, einzahl, ikone, stunden_pflicht, position, angelegt_am, aktualisiert_am, kiste) SELECT 'a538c43d-3b3d-5b99-9509-e4f850a72e44', 'Materialkisten', 'Materialkiste', 'package', 0, coalesce(max(position), -1) + 1, 1793750400000, 1793750400000, 1 FROM art;
--> statement-breakpoint
INSERT INTO frist (id, art_id, name, wer, monate, stunden, position) VALUES ('8ee6fcf7-883f-51c4-bade-3435a04260a2', 'a538c43d-3b3d-5b99-9509-e4f850a72e44', 'Quartalsprüfung', 'intern', 3, NULL, 0);
