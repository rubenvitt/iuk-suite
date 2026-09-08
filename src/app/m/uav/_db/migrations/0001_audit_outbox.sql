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
CREATE TRIGGER audit_executions_create AFTER INSERT ON "executions"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'uav', 'create', 'executions', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_executions_update AFTER UPDATE ON "executions"
WHEN OLD."id" IS NOT NEW."id" OR OLD."participant_id" IS NOT NEW."participant_id" OR OLD."task_id" IS NOT NEW."task_id" OR OLD."datum" IS NOT NEW."datum" OR OLD."drohnensteuerer" IS NOT NEW."drohnensteuerer" OR OLD."luftraumbeobachter" IS NOT NEW."luftraumbeobachter" OR OLD."created_at" IS NOT NEW."created_at" OR OLD."deleted_at" IS NOT NEW."deleted_at"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'uav', 'update', 'executions', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_executions_delete AFTER DELETE ON "executions"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'uav', 'delete', 'executions', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_participants_create AFTER INSERT ON "participants"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'uav', 'create', 'participants', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_participants_update AFTER UPDATE ON "participants"
WHEN OLD."id" IS NOT NEW."id" OR OLD."name" IS NOT NEW."name" OR OLD."login_code" IS NOT NEW."login_code" OR OLD."aktiv" IS NOT NEW."aktiv" OR OLD."beginn" IS NOT NEW."beginn" OR OLD."created_at" IS NOT NEW."created_at" OR OLD."last_seen" IS NOT NEW."last_seen"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'uav', 'update', 'participants', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_participants_delete AFTER DELETE ON "participants"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'uav', 'delete', 'participants', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_task_status_create AFTER INSERT ON "task_status"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'uav', 'create', 'task_status', suite_audit_reference(json_array(NEW.participant_id,NEW.task_id)), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_task_status_update AFTER UPDATE ON "task_status"
WHEN OLD."participant_id" IS NOT NEW."participant_id" OR OLD."task_id" IS NOT NEW."task_id" OR OLD."zielanzahl" IS NOT NEW."zielanzahl" OR OLD."nicht_anwendbar" IS NOT NEW."nicht_anwendbar" OR OLD."updated_at" IS NOT NEW."updated_at"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'uav', 'update', 'task_status', suite_audit_reference(json_array(NEW.participant_id,NEW.task_id)), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_task_status_delete AFTER DELETE ON "task_status"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'uav', 'delete', 'task_status', suite_audit_reference(json_array(OLD.participant_id,OLD.task_id)), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_tasks_create AFTER INSERT ON "tasks"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'uav', 'create', 'tasks', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_tasks_update AFTER UPDATE ON "tasks"
WHEN OLD."id" IS NOT NEW."id" OR OLD."teil" IS NOT NEW."teil" OR OLD."nummer" IS NOT NEW."nummer" OR OLD."titel" IS NOT NEW."titel" OR OLD."lernziel" IS NOT NEW."lernziel" OR OLD."schritte" IS NOT NEW."schritte" OR OLD."durchfuehrungshinweise" IS NOT NEW."durchfuehrungshinweise" OR OLD."sicherheitshinweise" IS NOT NEW."sicherheitshinweise" OR OLD."zielanzahl_default" IS NOT NEW."zielanzahl_default" OR OLD."sort_order" IS NOT NEW."sort_order" OR OLD."aktiv" IS NOT NEW."aktiv" OR OLD."bild" IS NOT NEW."bild" OR OLD."updated_at" IS NOT NEW."updated_at"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'uav', 'update', 'tasks', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_tasks_delete AFTER DELETE ON "tasks"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'uav', 'delete', 'tasks', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
