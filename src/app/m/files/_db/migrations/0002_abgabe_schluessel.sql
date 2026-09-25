-- DRK-448: der Idempotenzschlüssel des ersten Chunks einer anonymen Abgabe.
--
-- `ALTER TABLE` und Index hat `drizzle-kit generate` erzeugt (samt Snapshot); der
-- Rest ist HANDGESCHRIEBEN: das Werkzeug kennt die Audit-Trigger aus 0001 nicht und
-- liesse `audit_inbox_files_update` still auf seiner alten Spaltenkette stehen
-- (`core/audit/catalog.test.ts`: „audit UPDATE must cover every persisted column").
-- Vorbild: feedback/_db/migrations/0003_evenings_status.sql.
--
-- UNIQUE je Link, nicht global: der Schlüssel findet nur Abgaben des eigenen Tokens.
-- Mehrere NULL (Altbestand, Clients ohne Schlüssel) sind in SQLite zulässig.
ALTER TABLE `inbox_files` ADD `abgabe_schluessel` text;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_inbox_schluessel` ON `inbox_files` (`token_id`,`abgabe_schluessel`);--> statement-breakpoint
DROP TRIGGER audit_inbox_files_update;--> statement-breakpoint
CREATE TRIGGER audit_inbox_files_update AFTER UPDATE ON "inbox_files"
WHEN OLD."id" IS NOT NEW."id" OR OLD."token_id" IS NOT NEW."token_id" OR OLD."dateiname" IS NOT NEW."dateiname" OR OLD."kategorie" IS NOT NEW."kategorie" OR OLD."hinweis" IS NOT NEW."hinweis" OR OLD."mime_type" IS NOT NEW."mime_type" OR OLD."size" IS NOT NEW."size" OR OLD."client_ip_unbestaetigt" IS NOT NEW."client_ip_unbestaetigt" OR OLD."empfangen_at" IS NOT NEW."empfangen_at" OR OLD."bytes_vollstaendig_at" IS NOT NEW."bytes_vollstaendig_at" OR OLD."av_status" IS NOT NEW."av_status" OR OLD."av_geprueft_at" IS NOT NEW."av_geprueft_at" OR OLD."abgabe_schluessel" IS NOT NEW."abgabe_schluessel"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'files', 'update', 'inbox_files', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
