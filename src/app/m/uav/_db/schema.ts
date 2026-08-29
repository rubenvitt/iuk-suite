import { sqliteTable, text, integer, index, primaryKey } from "drizzle-orm/sqlite-core";

/*
 * 1:1 aus uav-praxis/server/db/schema.sql (Spec §2). Zeitstempel sind ISO-8601-TEXT (UTC),
 * Kalendertage ISO yyyy-mm-dd — der Import kopiert Werte unverändert.
 */
export const participants = sqliteTable("participants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  loginCode: text("login_code").notNull().unique(),      // Crockford-Base32, 8 Zeichen
  aktiv: integer("aktiv").notNull().default(1),
  beginn: text("beginn"),
  createdAt: text("created_at").notNull(),
  lastSeen: text("last_seen"),
});

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),                            // "1-1" beim Seed, sonst UUID
  teil: integer("teil").notNull(),
  nummer: text("nummer").notNull(),
  titel: text("titel").notNull(),
  lernziel: text("lernziel").notNull().default(""),
  schritte: text("schritte").notNull().default("[]"),     // JSON string[]
  durchfuehrungshinweise: text("durchfuehrungshinweise").notNull().default("[]"),
  sicherheitshinweise: text("sicherheitshinweise").notNull().default("[]"),
  zielanzahlDefault: integer("zielanzahl_default").notNull().default(1),
  sortOrder: integer("sort_order").notNull().default(0),
  aktiv: integer("aktiv").notNull().default(1),
  bild: text("bild"),                                     // relativer Pfad, Task 21 setzt das Präfix
  updatedAt: text("updated_at").notNull(),
});

export const executions = sqliteTable(
  "executions",
  {
    id: text("id").primaryKey(),                          // CLIENT-UUID → Idempotenz des Sync
    participantId: text("participant_id").notNull().references(() => participants.id, { onDelete: "cascade" }),
    taskId: text("task_id").notNull(),
    datum: text("datum").notNull(),
    drohnensteuerer: text("drohnensteuerer").notNull().default(""),
    luftraumbeobachter: text("luftraumbeobachter").notNull().default(""),
    createdAt: text("created_at").notNull(),
    deletedAt: text("deleted_at"),                        // Tombstone
  },
  (t) => [index("idx_executions_participant").on(t.participantId)],
);

export const taskStatus = sqliteTable(
  "task_status",
  {
    participantId: text("participant_id").notNull().references(() => participants.id, { onDelete: "cascade" }),
    taskId: text("task_id").notNull(),
    zielanzahl: integer("zielanzahl"),
    nichtAnwendbar: integer("nicht_anwendbar").notNull().default(0),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.participantId, t.taskId] })],
);

export const sessions = sqliteTable("sessions", {
  token: text("token").primaryKey(),                      // sha256-hex des Roh-Tokens
  kind: text("kind").notNull(),                           // nur noch 'participant'; 'admin' bleibt importierbar, wird nie gelesen
  subjectId: text("subject_id").notNull(),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
});

export type ParticipantRow = typeof participants.$inferSelect;
export type TaskRow = typeof tasks.$inferSelect;
export type ExecutionRow = typeof executions.$inferSelect;
export type TaskStatusRow = typeof taskStatus.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
