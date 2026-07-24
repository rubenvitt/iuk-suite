import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
  check,
  primaryKey,
} from "drizzle-orm/sqlite-core";

// Gruppen. `secret` ist Teil des öffentlichen QR-Tokens /f/{slug}-{secret}
// und muss beim Import 1:1 erhalten bleiben (gedruckte QR-Codes im Umlauf).
export const groups = sqliteTable(
  "groups",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    secret: text("secret").notNull(),
    closeAfterHours: integer("close_after_hours"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [uniqueIndex("idx_groups_slug").on(t.slug)],
);

export const evenings = sqliteTable(
  "evenings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    groupId: integer("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    // Reines Kalenderdatum (Mitternacht UTC). Kein Zeitanteil relevant.
    date: integer("date", { mode: "timestamp" }).notNull(),
    topic: text("topic"),
    notes: text("notes"),
    participantCount: integer("participant_count"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [index("idx_evenings_group_date").on(t.groupId, t.date)],
);

// Genau eine Umfrage pro Dienstabend (UNIQUE evening_id). `questions` ist ein
// JSON-Snapshot der Fragen zum Zeitpunkt der Erstellung — Alt-Umfragen können
// andere Typen/Texte tragen (u. a. `stars`), deshalb pro Umfrage eingefroren.
export const surveys = sqliteTable(
  "surveys",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    eveningId: integer("evening_id")
      .notNull()
      .references(() => evenings.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("draft"),
    questions: text("questions").notNull().default("[]"),
    closeAfterHours: integer("close_after_hours"),
    activatedAt: integer("activated_at", { mode: "timestamp" }),
    closesAt: integer("closes_at", { mode: "timestamp" }),
    closedAt: integer("closed_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [
    uniqueIndex("idx_surveys_evening").on(t.eveningId),
    index("idx_surveys_status").on(t.status),
    check(
      "surveys_status_check",
      sql`${t.status} IN ('draft','active','closed','archived')`,
    ),
  ],
);

// Anonyme Antworten. `answers` ist EINFACH JSON-kodiert: {questionId: value},
// value je nach Fragetyp Zahl (Rating) oder String (Text).
export const responses = sqliteTable(
  "responses",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    surveyId: integer("survey_id")
      .notNull()
      .references(() => surveys.id, { onDelete: "cascade" }),
    answers: text("answers").notNull(),
    submittedAt: integer("submitted_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [index("idx_responses_survey").on(t.surveyId)],
);

// Zuordnung Gruppenleiter → Gruppen. userId = OIDC-sub (TEXT, kein FK auf eine
// users-Tabelle: users/sessions werden nicht portiert, Identität kommt aus SSO).
export const userGroups = sqliteTable(
  "user_groups",
  {
    userId: text("user_id").notNull(),
    groupId: integer("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.groupId] })],
);

// Nutzerverzeichnis: füllt sich beim Betreten des Moduls (idempotenter Upsert),
// damit eine neue Gruppenleitung ohne Datenbankzugriff zuordenbar ist. Kein
// Identitätsspeicher — die Wahrheit bleibt das SSO, das hier ist nur eine
// Namensliste für die Zuordnungs-Oberfläche. Name/E-Mail dürfen fehlen.
export const knownUsers = sqliteTable("known_users", {
  userId: text("user_id").primaryKey(),
  name: text("name"),
  email: text("email"),
  seenAt: integer("seen_at", { mode: "timestamp" }).notNull(),
});

export type GroupRow = typeof groups.$inferSelect;
export type NewGroupRow = typeof groups.$inferInsert;
export type EveningRow = typeof evenings.$inferSelect;
export type NewEveningRow = typeof evenings.$inferInsert;
export type SurveyRow = typeof surveys.$inferSelect;
export type NewSurveyRow = typeof surveys.$inferInsert;
export type ResponseRow = typeof responses.$inferSelect;
export type NewResponseRow = typeof responses.$inferInsert;
export type UserGroupRow = typeof userGroups.$inferSelect;
export type NewUserGroupRow = typeof userGroups.$inferInsert;
export type KnownUserRow = typeof knownUsers.$inferSelect;
export type NewKnownUserRow = typeof knownUsers.$inferInsert;
