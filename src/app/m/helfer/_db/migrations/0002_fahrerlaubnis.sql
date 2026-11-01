-- IDA-313: Spalte `fahrerlaubnis` (nur die Klassen, für die Schichtplanung). drizzle-kit baut `helfer`
-- neu, weil eine neue CHECK-Bedingung dazukommt; bestehende Zeilen bekommen `[]`, der nächste Abgleich
-- füllt sie. DROP TABLE nimmt die Audit-Trigger mit: unten stehen sie wieder, `update` mit der neuen Spalte.
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
	`fahrerlaubnis` text DEFAULT '[]' NOT NULL,
	`fuer_einsatzbuch` integer DEFAULT true NOT NULL,
	`importiert_am` integer NOT NULL,
	`aktualisiert_am` integer NOT NULL,
	CONSTRAINT "helfer_herkunft" CHECK(herkunft IN ('hiorg','demo','datei')),
	CONSTRAINT "helfer_gruppen_json" CHECK(json_valid(gruppen)),
	CONSTRAINT "helfer_qualifikationen_json" CHECK(json_valid(qualifikationen)),
	CONSTRAINT "helfer_fahrerlaubnis_json" CHECK(json_valid(fahrerlaubnis))
);
--> statement-breakpoint
INSERT INTO `__new_helfer`("id", "herkunft", "quell_id", "vorname", "nachname", "status", "gruppen", "qualifikationen", "fahrerlaubnis", "fuer_einsatzbuch", "importiert_am", "aktualisiert_am") SELECT "id", "herkunft", "quell_id", "vorname", "nachname", "status", "gruppen", "qualifikationen", '[]', "fuer_einsatzbuch", "importiert_am", "aktualisiert_am" FROM `helfer`;--> statement-breakpoint
DROP TABLE `helfer`;--> statement-breakpoint
ALTER TABLE `__new_helfer` RENAME TO `helfer`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `helfer_quelle_idx` ON `helfer` (`herkunft`,`quell_id`);--> statement-breakpoint
CREATE TRIGGER audit_helfer_create AFTER INSERT ON "helfer"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'helfer', 'create', 'helfer', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_helfer_update AFTER UPDATE ON "helfer"
WHEN OLD."id" IS NOT NEW."id" OR OLD."herkunft" IS NOT NEW."herkunft" OR OLD."quell_id" IS NOT NEW."quell_id" OR OLD."vorname" IS NOT NEW."vorname" OR OLD."nachname" IS NOT NEW."nachname" OR OLD."status" IS NOT NEW."status" OR OLD."gruppen" IS NOT NEW."gruppen" OR OLD."qualifikationen" IS NOT NEW."qualifikationen" OR OLD."fahrerlaubnis" IS NOT NEW."fahrerlaubnis" OR OLD."fuer_einsatzbuch" IS NOT NEW."fuer_einsatzbuch" OR OLD."importiert_am" IS NOT NEW."importiert_am" OR OLD."aktualisiert_am" IS NOT NEW."aktualisiert_am"
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
