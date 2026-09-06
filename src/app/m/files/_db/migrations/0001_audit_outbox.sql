CREATE TABLE audit_outbox (
  id TEXT PRIMARY KEY NOT NULL,
  occurred_at INTEGER NOT NULL,
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  object_type TEXT NOT NULL,
  object_ref TEXT,
  actor TEXT NOT NULL,
  result TEXT NOT NULL,
  origin TEXT NOT NULL,
  correlation_id TEXT,
  CONSTRAINT audit_outbox_actor_json CHECK (json_valid(actor))
);
--> statement-breakpoint
CREATE INDEX audit_outbox_occurred_idx ON audit_outbox (occurred_at, id);
--> statement-breakpoint
CREATE TRIGGER audit_aufraeum_laeufe_create AFTER INSERT ON "aufraeum_laeufe"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'files', 'create', 'aufraeum_laeufe', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_aufraeum_laeufe_update AFTER UPDATE ON "aufraeum_laeufe"
WHEN OLD."id" IS NOT NEW."id" OR OLD."gestartet_at" IS NOT NEW."gestartet_at" OR OLD."beendet_at" IS NOT NEW."beendet_at" OR OLD."trockenlauf" IS NOT NEW."trockenlauf" OR OLD."shares_geloescht" IS NOT NEW."shares_geloescht" OR OLD."dateien_geloescht" IS NOT NEW."dateien_geloescht" OR OLD."bytes_geloescht" IS NOT NEW."bytes_geloescht" OR OLD."logzeilen_geloescht" IS NOT NEW."logzeilen_geloescht" OR OLD."inbox_geloescht" IS NOT NEW."inbox_geloescht" OR OLD."parts_geloescht" IS NOT NEW."parts_geloescht" OR OLD."verwaiste_blobs_gemeldet" IS NOT NEW."verwaiste_blobs_gemeldet" OR OLD."fehler" IS NOT NEW."fehler"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'files', 'update', 'aufraeum_laeufe', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_aufraeum_laeufe_delete AFTER DELETE ON "aufraeum_laeufe"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'files', 'delete', 'aufraeum_laeufe', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_inbox_files_create AFTER INSERT ON "inbox_files"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'files', 'create', 'inbox_files', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_inbox_files_update AFTER UPDATE ON "inbox_files"
WHEN OLD."id" IS NOT NEW."id" OR OLD."token_id" IS NOT NEW."token_id" OR OLD."dateiname" IS NOT NEW."dateiname" OR OLD."kategorie" IS NOT NEW."kategorie" OR OLD."hinweis" IS NOT NEW."hinweis" OR OLD."mime_type" IS NOT NEW."mime_type" OR OLD."size" IS NOT NEW."size" OR OLD."client_ip_unbestaetigt" IS NOT NEW."client_ip_unbestaetigt" OR OLD."empfangen_at" IS NOT NEW."empfangen_at" OR OLD."bytes_vollstaendig_at" IS NOT NEW."bytes_vollstaendig_at" OR OLD."av_status" IS NOT NEW."av_status" OR OLD."av_geprueft_at" IS NOT NEW."av_geprueft_at"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'files', 'update', 'inbox_files', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_inbox_files_delete AFTER DELETE ON "inbox_files"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'files', 'delete', 'inbox_files', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_share_files_create AFTER INSERT ON "share_files"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'files', 'create', 'share_files', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_share_files_update AFTER UPDATE ON "share_files"
WHEN OLD."id" IS NOT NEW."id" OR OLD."share_id" IS NOT NEW."share_id" OR OLD."filename" IS NOT NEW."filename" OR OLD."mime_type" IS NOT NEW."mime_type" OR OLD."size" IS NOT NEW."size" OR OLD."created_at" IS NOT NEW."created_at" OR OLD."bytes_vollstaendig_at" IS NOT NEW."bytes_vollstaendig_at" OR OLD."av_status" IS NOT NEW."av_status" OR OLD."av_geprueft_at" IS NOT NEW."av_geprueft_at"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'files', 'update', 'share_files', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_share_files_delete AFTER DELETE ON "share_files"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'files', 'delete', 'share_files', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_shares_create AFTER INSERT ON "shares"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'files', 'create', 'shares', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_shares_update AFTER UPDATE ON "shares"
WHEN OLD."id" IS NOT NEW."id" OR OLD."title" IS NOT NEW."title" OR OLD."description" IS NOT NEW."description" OR OLD."type" IS NOT NEW."type" OR OLD."expires_at" IS NOT NEW."expires_at" OR OLD."max_downloads" IS NOT NEW."max_downloads" OR OLD."download_count" IS NOT NEW."download_count" OR OLD."password_hash" IS NOT NEW."password_hash" OR OLD."total_size" IS NOT NEW."total_size" OR OLD."created_at" IS NOT NEW."created_at" OR OLD."created_by" IS NOT NEW."created_by"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'files', 'update', 'shares', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_shares_delete AFTER DELETE ON "shares"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'files', 'delete', 'shares', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_zugangslinks_create AFTER INSERT ON "zugangslinks"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'files', 'create', 'zugangslinks', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_zugangslinks_update AFTER UPDATE ON "zugangslinks"
WHEN OLD."id" IS NOT NEW."id" OR OLD."name" IS NOT NEW."name" OR OLD."token_start" IS NOT NEW."token_start" OR OLD."token_hash" IS NOT NEW."token_hash" OR OLD."created_at" IS NOT NEW."created_at" OR OLD."created_by" IS NOT NEW."created_by" OR OLD."expires_at" IS NOT NEW."expires_at" OR OLD."revoked_at" IS NOT NEW."revoked_at" OR OLD."budget_dateien" IS NOT NEW."budget_dateien" OR OLD."budget_bytes" IS NOT NEW."budget_bytes" OR OLD."verbraucht_dateien" IS NOT NEW."verbraucht_dateien" OR OLD."verbraucht_bytes" IS NOT NEW."verbraucht_bytes"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'files', 'update', 'zugangslinks', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_zugangslinks_delete AFTER DELETE ON "zugangslinks"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'files', 'delete', 'zugangslinks', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
