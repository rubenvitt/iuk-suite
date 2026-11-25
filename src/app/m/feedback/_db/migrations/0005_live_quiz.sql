-- HANDGESCHRIEBEN (wie 0003/0004): Live-Quiz.
--
-- `quizze` ist die Vorlage, `quiz_runden` der Durchlauf an einem Abend mit Schnappschuss der
-- Fragen. Vorlage löschen: `quiz_id` wird NULL, die Runde bleibt. Abend löschen: die Runde geht mit.
-- Audit: `quizze` und `quiz_runden` gewöhnlich (der Update-Trigger lässt `schritt` und
-- `schritt_seit` aus, jeder Klick des Beamers schaltet den Schritt). `quiz_teilnahmen` und
-- `quiz_antworten` sind ausgeschlossen (Live-Spieldaten anonymer Teilnehmender), ohne Trigger.
CREATE TABLE `quizze` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`group_id` integer NOT NULL,
	`titel` text NOT NULL,
	`modus` text NOT NULL,
	`fragen` text DEFAULT '[]' NOT NULL,
	`moderation_secret` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "quizze_modus_check" CHECK("quizze"."modus" IN ('lagebild','wettbewerb'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quizze_moderation_secret_unique` ON `quizze` (`moderation_secret`);
--> statement-breakpoint
CREATE TABLE `quiz_runden` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`quiz_id` integer,
	`evening_id` integer NOT NULL,
	`beitritt_code` text NOT NULL,
	`modus` text NOT NULL,
	`fragen` text NOT NULL,
	`schritt` integer DEFAULT 0 NOT NULL,
	`schritt_seit` integer NOT NULL,
	`beendet_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`quiz_id`) REFERENCES `quizze`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`evening_id`) REFERENCES `evenings`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "quiz_runden_modus_check" CHECK("quiz_runden"."modus" IN ('lagebild','wettbewerb'))
);
--> statement-breakpoint
CREATE INDEX `idx_quiz_runden_code` ON `quiz_runden` (`beitritt_code`,`beendet_at`);
--> statement-breakpoint
CREATE INDEX `idx_quiz_runden_quiz` ON `quiz_runden` (`quiz_id`);
--> statement-breakpoint
CREATE TABLE `quiz_teilnahmen` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`runde_id` integer NOT NULL,
	`spitzname` text,
	`token_hash` text,
	FOREIGN KEY (`runde_id`) REFERENCES `quiz_runden`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_quiz_teilnahmen_token` ON `quiz_teilnahmen` (`runde_id`,`token_hash`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_quiz_teilnahmen_spitzname` ON `quiz_teilnahmen` (`runde_id`,`spitzname`);
--> statement-breakpoint
CREATE TABLE `quiz_antworten` (
	`teilnahme_id` integer NOT NULL,
	`frage_index` integer NOT NULL,
	`antwort` text NOT NULL,
	`richtig` integer NOT NULL,
	`punkte` integer NOT NULL,
	`antwortzeit_ms` integer,
	PRIMARY KEY(`teilnahme_id`, `frage_index`),
	FOREIGN KEY (`teilnahme_id`) REFERENCES `quiz_teilnahmen`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TRIGGER audit_quizze_create AFTER INSERT ON "quizze"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'feedback', 'create', 'quizze', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_quizze_update AFTER UPDATE ON "quizze"
WHEN OLD."id" IS NOT NEW."id" OR OLD."group_id" IS NOT NEW."group_id" OR OLD."titel" IS NOT NEW."titel" OR OLD."modus" IS NOT NEW."modus" OR OLD."fragen" IS NOT NEW."fragen" OR OLD."moderation_secret" IS NOT NEW."moderation_secret" OR OLD."created_at" IS NOT NEW."created_at" OR OLD."updated_at" IS NOT NEW."updated_at"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'feedback', 'update', 'quizze', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_quizze_delete AFTER DELETE ON "quizze"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'feedback', 'delete', 'quizze', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_quiz_runden_create AFTER INSERT ON "quiz_runden"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'feedback', 'create', 'quiz_runden', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_quiz_runden_update AFTER UPDATE ON "quiz_runden"
WHEN OLD."id" IS NOT NEW."id" OR OLD."quiz_id" IS NOT NEW."quiz_id" OR OLD."evening_id" IS NOT NEW."evening_id" OR OLD."beitritt_code" IS NOT NEW."beitritt_code" OR OLD."modus" IS NOT NEW."modus" OR OLD."fragen" IS NOT NEW."fragen" OR OLD."beendet_at" IS NOT NEW."beendet_at" OR OLD."created_at" IS NOT NEW."created_at"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'feedback', 'update', 'quiz_runden', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_quiz_runden_delete AFTER DELETE ON "quiz_runden"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'feedback', 'delete', 'quiz_runden', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
