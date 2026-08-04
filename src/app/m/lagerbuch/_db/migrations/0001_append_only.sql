CREATE TRIGGER buchungen_no_update
BEFORE UPDATE ON buchungen
BEGIN
  SELECT RAISE(ABORT, 'journal ist append-only');
END;
--> statement-breakpoint
CREATE TRIGGER buchungen_no_delete
BEFORE DELETE ON buchungen
BEGIN
  SELECT RAISE(ABORT, 'journal ist append-only');
END;
