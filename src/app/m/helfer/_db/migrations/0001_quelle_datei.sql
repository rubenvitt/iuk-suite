-- IDA-281: dritte Quelle `datei` (Excel-Liste). SQLite ändert keine CHECK-Bedingung an Ort und
-- Stelle; drizzle-kit baut `helfer` und `importlauf` deshalb neu. DROP TABLE nimmt die Audit-Trigger
-- mit, sie stehen unten unverändert aus 0000_grundbestand wieder da (das Umkopieren selbst feuert
-- keinen, denn `__new_*` hat noch keine).
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_helfer` (
	`id` text PRIMARY KEY NOT NULL,
	`herkunft` text NOT NULL,
	`quell_id` text NOT NULL,
	`vorname` text NOT NULL,
	`nachname` text NOT NULL,
	`status` text NOT NULL,
	`gruppen` text DEFAULT '[]' NOT NULL,
	`qualifikationen` text DEFAULT '[]' NOT NULL,
	`fuer_einsatzbuch` integer DEFAULT true NOT NULL,
	`importiert_am` integer NOT NULL,
	`aktualisiert_am` integer NOT NULL,
	CONSTRAINT "helfer_herkunft" CHECK(herkunft IN ('hiorg','demo','datei')),
	CONSTRAINT "helfer_gruppen_json" CHECK(json_valid(gruppen)),
	CONSTRAINT "helfer_qualifikationen_json" CHECK(json_valid(qualifikationen))
);
--> statement-breakpoint
INSERT INTO `__new_helfer`("id", "herkunft", "quell_id", "vorname", "nachname", "status", "gruppen", "qualifikationen", "fuer_einsatzbuch", "importiert_am", "aktualisiert_am") SELECT "id", "herkunft", "quell_id", "vorname", "nachname", "status", "gruppen", "qualifikationen", "fuer_einsatzbuch", "importiert_am", "aktualisiert_am" FROM `helfer`;--> statement-breakpoint
DROP TABLE `helfer`;--> statement-breakpoint
ALTER TABLE `__new_helfer` RENAME TO `helfer`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `helfer_quelle_idx` ON `helfer` (`herkunft`,`quell_id`);--> statement-breakpoint
CREATE TABLE `__new_importlauf` (
	`id` text PRIMARY KEY NOT NULL,
	`zeitpunkt` integer NOT NULL,
	`quelle` text NOT NULL,
	`von_name` text NOT NULL,
	`von_sub` text NOT NULL,
	`gelesen` integer NOT NULL,
	`neu` integer NOT NULL,
	`geaendert` integer NOT NULL,
	`entfernt` integer NOT NULL,
	`ausgefiltert` text DEFAULT '{}' NOT NULL,
	CONSTRAINT "importlauf_quelle" CHECK(quelle IN ('hiorg','demo','datei')),
	CONSTRAINT "importlauf_ausgefiltert_json" CHECK(json_valid(ausgefiltert))
);
--> statement-breakpoint
INSERT INTO `__new_importlauf`("id", "zeitpunkt", "quelle", "von_name", "von_sub", "gelesen", "neu", "geaendert", "entfernt", "ausgefiltert") SELECT "id", "zeitpunkt", "quelle", "von_name", "von_sub", "gelesen", "neu", "geaendert", "entfernt", "ausgefiltert" FROM `importlauf`;--> statement-breakpoint
DROP TABLE `importlauf`;--> statement-breakpoint
ALTER TABLE `__new_importlauf` RENAME TO `importlauf`;--> statement-breakpoint
CREATE TRIGGER audit_helfer_create AFTER INSERT ON "helfer"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'helfer', 'create', 'helfer', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_helfer_update AFTER UPDATE ON "helfer"
WHEN OLD."id" IS NOT NEW."id" OR OLD."herkunft" IS NOT NEW."herkunft" OR OLD."quell_id" IS NOT NEW."quell_id" OR OLD."vorname" IS NOT NEW."vorname" OR OLD."nachname" IS NOT NEW."nachname" OR OLD."status" IS NOT NEW."status" OR OLD."gruppen" IS NOT NEW."gruppen" OR OLD."qualifikationen" IS NOT NEW."qualifikationen" OR OLD."fuer_einsatzbuch" IS NOT NEW."fuer_einsatzbuch" OR OLD."importiert_am" IS NOT NEW."importiert_am" OR OLD."aktualisiert_am" IS NOT NEW."aktualisiert_am"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'helfer', 'update', 'helfer', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_helfer_delete AFTER DELETE ON "helfer"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'helfer', 'delete', 'helfer', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_importlauf_create AFTER INSERT ON "importlauf"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'helfer', 'create', 'importlauf', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_importlauf_update AFTER UPDATE ON "importlauf"
WHEN OLD."id" IS NOT NEW."id" OR OLD."zeitpunkt" IS NOT NEW."zeitpunkt" OR OLD."quelle" IS NOT NEW."quelle" OR OLD."von_name" IS NOT NEW."von_name" OR OLD."von_sub" IS NOT NEW."von_sub" OR OLD."gelesen" IS NOT NEW."gelesen" OR OLD."neu" IS NOT NEW."neu" OR OLD."geaendert" IS NOT NEW."geaendert" OR OLD."entfernt" IS NOT NEW."entfernt" OR OLD."ausgefiltert" IS NOT NEW."ausgefiltert"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'helfer', 'update', 'importlauf', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_importlauf_delete AFTER DELETE ON "importlauf"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'helfer', 'delete', 'importlauf', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
