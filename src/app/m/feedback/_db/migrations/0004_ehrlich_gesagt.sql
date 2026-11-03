-- HANDGESCHRIEBEN (wie 0003): „Ehrlich gesagt" (IDA-314), der Kummerkasten der Bereitschaft.
--
-- `ehrlich_mitteilungen` und `ehrlich_nachrichten` sind im Audit ANONYM, wie `responses`:
-- fester Akteur `{"kind":"anonymous"}`, kein Objektbezug, keine Korrelation. Ein Bezug
-- auf die Kennung stünde sonst neben dem genauen Zeitpunkt des Eingangs, und die
-- Mitteilung speichert bewusst nur den Tag. Kasten (Link neu erzeugen) und interne
-- Notizen sind gewöhnlich auditiert: dort handelt eine angemeldete Vertrauensperson.
CREATE TABLE `ehrlich_kasten` (
	`id` integer PRIMARY KEY NOT NULL,
	`secret` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ehrlich_mitteilungen` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tag` text NOT NULL,
	`thema` text,
	`text` text NOT NULL,
	`antwortweg` text NOT NULL,
	`name` text,
	`kontakt` text,
	`code_hash` text,
	`status` text DEFAULT 'neu' NOT NULL,
	`rueckfrage_erlaubt` integer DEFAULT false NOT NULL,
	`erledigt_tag` text,
	`gemeldet` integer DEFAULT false NOT NULL,
	CONSTRAINT "ehrlich_mitteilungen_antwortweg_check" CHECK("ehrlich_mitteilungen"."antwortweg" IN ('keine','code','name')),
	CONSTRAINT "ehrlich_mitteilungen_status_check" CHECK("ehrlich_mitteilungen"."status" IN ('neu','bearbeitung','erledigt'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_ehrlich_mitteilungen_code` ON `ehrlich_mitteilungen` (`code_hash`);
--> statement-breakpoint
CREATE INDEX `idx_ehrlich_mitteilungen_tag` ON `ehrlich_mitteilungen` (`tag`);
--> statement-breakpoint
CREATE TABLE `ehrlich_nachrichten` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`mitteilung_id` integer NOT NULL,
	`von` text NOT NULL,
	`autor` text,
	`text` text NOT NULL,
	`tag` text NOT NULL,
	`gemeldet` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`mitteilung_id`) REFERENCES `ehrlich_mitteilungen`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ehrlich_nachrichten_von_check" CHECK("ehrlich_nachrichten"."von" IN ('vp','person'))
);
--> statement-breakpoint
CREATE INDEX `idx_ehrlich_nachrichten_mitteilung` ON `ehrlich_nachrichten` (`mitteilung_id`);
--> statement-breakpoint
CREATE TABLE `ehrlich_notizen` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`mitteilung_id` integer NOT NULL,
	`autor` text NOT NULL,
	`text` text NOT NULL,
	`tag` text NOT NULL,
	`kontakt` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`mitteilung_id`) REFERENCES `ehrlich_mitteilungen`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_ehrlich_notizen_mitteilung` ON `ehrlich_notizen` (`mitteilung_id`);
--> statement-breakpoint
CREATE TRIGGER audit_ehrlich_kasten_create AFTER INSERT ON "ehrlich_kasten"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'feedback', 'create', 'ehrlich_kasten', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_ehrlich_kasten_update AFTER UPDATE ON "ehrlich_kasten"
WHEN OLD."id" IS NOT NEW."id" OR OLD."secret" IS NOT NEW."secret" OR OLD."created_at" IS NOT NEW."created_at"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'feedback', 'update', 'ehrlich_kasten', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_ehrlich_kasten_delete AFTER DELETE ON "ehrlich_kasten"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'feedback', 'delete', 'ehrlich_kasten', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_ehrlich_mitteilungen_create AFTER INSERT ON "ehrlich_mitteilungen"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'feedback', 'create', 'ehrlich_mitteilungen', NULL, '{"kind":"anonymous"}', 'success', 'database', NULL);
END;
--> statement-breakpoint
CREATE TRIGGER audit_ehrlich_mitteilungen_update AFTER UPDATE ON "ehrlich_mitteilungen"
WHEN OLD."id" IS NOT NEW."id" OR OLD."tag" IS NOT NEW."tag" OR OLD."thema" IS NOT NEW."thema" OR OLD."text" IS NOT NEW."text" OR OLD."antwortweg" IS NOT NEW."antwortweg" OR OLD."name" IS NOT NEW."name" OR OLD."kontakt" IS NOT NEW."kontakt" OR OLD."code_hash" IS NOT NEW."code_hash" OR OLD."status" IS NOT NEW."status" OR OLD."rueckfrage_erlaubt" IS NOT NEW."rueckfrage_erlaubt" OR OLD."erledigt_tag" IS NOT NEW."erledigt_tag" OR OLD."gemeldet" IS NOT NEW."gemeldet"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'feedback', 'update', 'ehrlich_mitteilungen', NULL, '{"kind":"anonymous"}', 'success', 'database', NULL);
END;
--> statement-breakpoint
CREATE TRIGGER audit_ehrlich_mitteilungen_delete AFTER DELETE ON "ehrlich_mitteilungen"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'feedback', 'delete', 'ehrlich_mitteilungen', NULL, '{"kind":"anonymous"}', 'success', 'database', NULL);
END;
--> statement-breakpoint
CREATE TRIGGER audit_ehrlich_nachrichten_create AFTER INSERT ON "ehrlich_nachrichten"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'feedback', 'create', 'ehrlich_nachrichten', NULL, '{"kind":"anonymous"}', 'success', 'database', NULL);
END;
--> statement-breakpoint
CREATE TRIGGER audit_ehrlich_nachrichten_update AFTER UPDATE ON "ehrlich_nachrichten"
WHEN OLD."id" IS NOT NEW."id" OR OLD."mitteilung_id" IS NOT NEW."mitteilung_id" OR OLD."von" IS NOT NEW."von" OR OLD."autor" IS NOT NEW."autor" OR OLD."text" IS NOT NEW."text" OR OLD."tag" IS NOT NEW."tag" OR OLD."gemeldet" IS NOT NEW."gemeldet"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'feedback', 'update', 'ehrlich_nachrichten', NULL, '{"kind":"anonymous"}', 'success', 'database', NULL);
END;
--> statement-breakpoint
CREATE TRIGGER audit_ehrlich_nachrichten_delete AFTER DELETE ON "ehrlich_nachrichten"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'feedback', 'delete', 'ehrlich_nachrichten', NULL, '{"kind":"anonymous"}', 'success', 'database', NULL);
END;
--> statement-breakpoint
CREATE TRIGGER audit_ehrlich_notizen_create AFTER INSERT ON "ehrlich_notizen"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'feedback', 'create', 'ehrlich_notizen', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_ehrlich_notizen_update AFTER UPDATE ON "ehrlich_notizen"
WHEN OLD."id" IS NOT NEW."id" OR OLD."mitteilung_id" IS NOT NEW."mitteilung_id" OR OLD."autor" IS NOT NEW."autor" OR OLD."text" IS NOT NEW."text" OR OLD."tag" IS NOT NEW."tag" OR OLD."kontakt" IS NOT NEW."kontakt"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'feedback', 'update', 'ehrlich_notizen', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_ehrlich_notizen_delete AFTER DELETE ON "ehrlich_notizen"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'feedback', 'delete', 'ehrlich_notizen', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
