-- IDA-316: Grundbestand des Moduls verpflegung (Verpflegungslager). Tabellen von drizzle-kit generiert, die Audit-
-- Trigger (je audited Tabelle create/update/delete, AUDIT_TABLES.verpflegung) von Hand angehängt: drizzle-kit kennt
-- sie nicht. Wer eine Spalte ergänzt, setzt den UPDATE-Trigger in derselben Migration neu.
CREATE TABLE `artikel` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`ean` text,
	`kategorie` text NOT NULL,
	`einheit` text NOT NULL,
	`mhd_art` text DEFAULT 'mhd' NOT NULL,
	`rot_tage` integer DEFAULT 7 NOT NULL,
	`gelb_tage` integer DEFAULT 30 NOT NULL,
	`mindest` real,
	`vorlaeufig` integer DEFAULT false NOT NULL,
	`aktiv` integer DEFAULT true NOT NULL,
	`angelegt_am` integer NOT NULL,
	`aktualisiert_am` integer NOT NULL,
	CONSTRAINT "artikel_mhd_art" CHECK(mhd_art IN ('mhd','verbrauch')),
	CONSTRAINT "artikel_schwellen" CHECK(rot_tage >= 0 AND gelb_tage >= rot_tage),
	CONSTRAINT "artikel_mindest" CHECK(mindest IS NULL OR mindest > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `artikel_ean_idx` ON `artikel` (`ean`);--> statement-breakpoint
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
CREATE TABLE `buchung` (
	`id` text PRIMARY KEY NOT NULL,
	`zeit` integer NOT NULL,
	`art` text NOT NULL,
	`artikel_id` text NOT NULL,
	`ort_id` text NOT NULL,
	`mhd` text NOT NULL,
	`menge` real NOT NULL,
	`wer` text NOT NULL,
	`link_id` text,
	`grund` text,
	`ziel` text,
	FOREIGN KEY (`artikel_id`) REFERENCES `artikel`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ort_id`) REFERENCES `lagerort`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`link_id`) REFERENCES `helfer_link`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "buchung_art" CHECK(art IN ('eingang','ausgabe','aussonderung')),
	CONSTRAINT "buchung_menge" CHECK(menge > 0)
);
--> statement-breakpoint
CREATE INDEX `buchung_zeit_idx` ON `buchung` (`zeit`);--> statement-breakpoint
CREATE INDEX `buchung_artikel_idx` ON `buchung` (`artikel_id`,`zeit`);--> statement-breakpoint
CREATE TABLE `charge` (
	`id` text PRIMARY KEY NOT NULL,
	`artikel_id` text NOT NULL,
	`ort_id` text NOT NULL,
	`mhd` text NOT NULL,
	`menge` real NOT NULL,
	`eingang` text NOT NULL,
	`angelegt_am` integer NOT NULL,
	`aktualisiert_am` integer NOT NULL,
	FOREIGN KEY (`artikel_id`) REFERENCES `artikel`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ort_id`) REFERENCES `lagerort`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "charge_mhd" CHECK(mhd GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "charge_eingang" CHECK(eingang GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "charge_menge" CHECK(menge > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `charge_ware_ort_mhd_idx` ON `charge` (`artikel_id`,`ort_id`,`mhd`);--> statement-breakpoint
CREATE INDEX `charge_mhd_idx` ON `charge` (`mhd`);--> statement-breakpoint
CREATE TABLE `helfer_link` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`gueltig_bis` integer NOT NULL,
	`aktiv` integer DEFAULT true NOT NULL,
	`angelegt_am` integer NOT NULL,
	`angelegt_von` text DEFAULT '' NOT NULL,
	`zuletzt_am` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `helfer_link_code_idx` ON `helfer_link` (`code`);--> statement-breakpoint
CREATE TABLE `lagerort` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kurz` text NOT NULL,
	`gekuehlt` integer DEFAULT false NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`aktiv` integer DEFAULT true NOT NULL,
	`angelegt_am` integer NOT NULL,
	`aktualisiert_am` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `vermerk` (
	`id` text PRIMARY KEY NOT NULL,
	`am` integer NOT NULL
);--> statement-breakpoint
CREATE TRIGGER audit_lagerort_create AFTER INSERT ON "lagerort"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'verpflegung', 'create', 'lagerort', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_lagerort_update AFTER UPDATE ON "lagerort"
WHEN OLD."id" IS NOT NEW."id" OR OLD."name" IS NOT NEW."name" OR OLD."kurz" IS NOT NEW."kurz" OR OLD."gekuehlt" IS NOT NEW."gekuehlt" OR OLD."position" IS NOT NEW."position" OR OLD."aktiv" IS NOT NEW."aktiv" OR OLD."angelegt_am" IS NOT NEW."angelegt_am" OR OLD."aktualisiert_am" IS NOT NEW."aktualisiert_am"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'verpflegung', 'update', 'lagerort', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_lagerort_delete AFTER DELETE ON "lagerort"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'verpflegung', 'delete', 'lagerort', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_artikel_create AFTER INSERT ON "artikel"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'verpflegung', 'create', 'artikel', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_artikel_update AFTER UPDATE ON "artikel"
WHEN OLD."id" IS NOT NEW."id" OR OLD."name" IS NOT NEW."name" OR OLD."ean" IS NOT NEW."ean" OR OLD."kategorie" IS NOT NEW."kategorie" OR OLD."einheit" IS NOT NEW."einheit" OR OLD."mhd_art" IS NOT NEW."mhd_art" OR OLD."rot_tage" IS NOT NEW."rot_tage" OR OLD."gelb_tage" IS NOT NEW."gelb_tage" OR OLD."mindest" IS NOT NEW."mindest" OR OLD."vorlaeufig" IS NOT NEW."vorlaeufig" OR OLD."aktiv" IS NOT NEW."aktiv" OR OLD."angelegt_am" IS NOT NEW."angelegt_am" OR OLD."aktualisiert_am" IS NOT NEW."aktualisiert_am"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'verpflegung', 'update', 'artikel', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_artikel_delete AFTER DELETE ON "artikel"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'verpflegung', 'delete', 'artikel', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_charge_create AFTER INSERT ON "charge"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'verpflegung', 'create', 'charge', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_charge_update AFTER UPDATE ON "charge"
WHEN OLD."id" IS NOT NEW."id" OR OLD."artikel_id" IS NOT NEW."artikel_id" OR OLD."ort_id" IS NOT NEW."ort_id" OR OLD."mhd" IS NOT NEW."mhd" OR OLD."menge" IS NOT NEW."menge" OR OLD."eingang" IS NOT NEW."eingang" OR OLD."angelegt_am" IS NOT NEW."angelegt_am" OR OLD."aktualisiert_am" IS NOT NEW."aktualisiert_am"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'verpflegung', 'update', 'charge', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_charge_delete AFTER DELETE ON "charge"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'verpflegung', 'delete', 'charge', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_helfer_link_create AFTER INSERT ON "helfer_link"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'verpflegung', 'create', 'helfer_link', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_helfer_link_update AFTER UPDATE ON "helfer_link"
WHEN OLD."id" IS NOT NEW."id" OR OLD."code" IS NOT NEW."code" OR OLD."name" IS NOT NEW."name" OR OLD."gueltig_bis" IS NOT NEW."gueltig_bis" OR OLD."aktiv" IS NOT NEW."aktiv" OR OLD."angelegt_am" IS NOT NEW."angelegt_am" OR OLD."angelegt_von" IS NOT NEW."angelegt_von"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'verpflegung', 'update', 'helfer_link', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_helfer_link_delete AFTER DELETE ON "helfer_link"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'verpflegung', 'delete', 'helfer_link', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_buchung_create AFTER INSERT ON "buchung"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'verpflegung', 'create', 'buchung', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_buchung_update AFTER UPDATE ON "buchung"
WHEN OLD."id" IS NOT NEW."id" OR OLD."zeit" IS NOT NEW."zeit" OR OLD."art" IS NOT NEW."art" OR OLD."artikel_id" IS NOT NEW."artikel_id" OR OLD."ort_id" IS NOT NEW."ort_id" OR OLD."mhd" IS NOT NEW."mhd" OR OLD."menge" IS NOT NEW."menge" OR OLD."wer" IS NOT NEW."wer" OR OLD."link_id" IS NOT NEW."link_id" OR OLD."grund" IS NOT NEW."grund" OR OLD."ziel" IS NOT NEW."ziel"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'verpflegung', 'update', 'buchung', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_buchung_delete AFTER DELETE ON "buchung"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'verpflegung', 'delete', 'buchung', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
