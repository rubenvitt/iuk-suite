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
CREATE TRIGGER audit_evenings_create AFTER INSERT ON "evenings"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'feedback', 'create', 'evenings', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_evenings_update AFTER UPDATE ON "evenings"
WHEN OLD."id" IS NOT NEW."id" OR OLD."group_id" IS NOT NEW."group_id" OR OLD."date" IS NOT NEW."date" OR OLD."topic" IS NOT NEW."topic" OR OLD."notes" IS NOT NEW."notes" OR OLD."participant_count" IS NOT NEW."participant_count" OR OLD."created_at" IS NOT NEW."created_at"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'feedback', 'update', 'evenings', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_evenings_delete AFTER DELETE ON "evenings"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'feedback', 'delete', 'evenings', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_groups_create AFTER INSERT ON "groups"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'feedback', 'create', 'groups', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_groups_update AFTER UPDATE ON "groups"
WHEN OLD."id" IS NOT NEW."id" OR OLD."name" IS NOT NEW."name" OR OLD."slug" IS NOT NEW."slug" OR OLD."secret" IS NOT NEW."secret" OR OLD."close_after_hours" IS NOT NEW."close_after_hours" OR OLD."created_at" IS NOT NEW."created_at"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'feedback', 'update', 'groups', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_groups_delete AFTER DELETE ON "groups"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'feedback', 'delete', 'groups', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_responses_create AFTER INSERT ON "responses"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'feedback', 'create', 'responses', NULL, '{"kind":"anonymous"}', 'success', 'database', NULL);
END;
--> statement-breakpoint
CREATE TRIGGER audit_responses_update AFTER UPDATE ON "responses"
WHEN OLD."id" IS NOT NEW."id" OR OLD."survey_id" IS NOT NEW."survey_id" OR OLD."answers" IS NOT NEW."answers" OR OLD."submitted_at" IS NOT NEW."submitted_at"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'feedback', 'update', 'responses', NULL, '{"kind":"anonymous"}', 'success', 'database', NULL);
END;
--> statement-breakpoint
CREATE TRIGGER audit_responses_delete AFTER DELETE ON "responses"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'feedback', 'delete', 'responses', NULL, '{"kind":"anonymous"}', 'success', 'database', NULL);
END;
--> statement-breakpoint
CREATE TRIGGER audit_surveys_create AFTER INSERT ON "surveys"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'feedback', 'create', 'surveys', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_surveys_update AFTER UPDATE ON "surveys"
WHEN OLD."id" IS NOT NEW."id" OR OLD."evening_id" IS NOT NEW."evening_id" OR OLD."status" IS NOT NEW."status" OR OLD."questions" IS NOT NEW."questions" OR OLD."close_after_hours" IS NOT NEW."close_after_hours" OR OLD."activated_at" IS NOT NEW."activated_at" OR OLD."closes_at" IS NOT NEW."closes_at" OR OLD."closed_at" IS NOT NEW."closed_at" OR OLD."created_at" IS NOT NEW."created_at"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'feedback', 'update', 'surveys', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_surveys_delete AFTER DELETE ON "surveys"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'feedback', 'delete', 'surveys', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_user_groups_create AFTER INSERT ON "user_groups"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'feedback', 'create', 'user_groups', suite_audit_reference(json_array(NEW.user_id,NEW.group_id)), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_user_groups_update AFTER UPDATE ON "user_groups"
WHEN OLD."user_id" IS NOT NEW."user_id" OR OLD."group_id" IS NOT NEW."group_id"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'feedback', 'update', 'user_groups', suite_audit_reference(json_array(NEW.user_id,NEW.group_id)), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_user_groups_delete AFTER DELETE ON "user_groups"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'feedback', 'delete', 'user_groups', suite_audit_reference(json_array(OLD.user_id,OLD.group_id)), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
