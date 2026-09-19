export { auditOutbox } from "@/core/audit/_db/schema";
import { sql } from "drizzle-orm";
import type { EveningStatus } from "@/app/m/feedback/_lib/lifecycle";
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

/**
 * DER DIENSTABEND IST DIE ERSTE KLASSE, die Umfrage hängt daran — nicht
 * umgekehrt. Deshalb trägt der ABEND seine Lebenslage, nicht die Umfrage:
 *
 * * `planned` — im Voraus angesetzt, noch ohne Umfrage. Der QR-Code gilt für
 *   ihn nicht; freigegeben wird am Abend selbst.
 * * `held` — hat stattgefunden. Das ist die Lage jedes Abends, der über
 *   „Feedback starten" entsteht, und die jedes nachgetragenen Abends.
 * * `cancelled` — war angesetzt und fiel aus. BLEIBT STEHEN, statt gelöscht zu
 *   werden: „am 3. November war kein Dienst" ist eine Auskunft, eine fehlende
 *   Zeile ist keine.
 *
 * ⚠️ DER NAHELIEGENDE WEG WÄRE `surveys.status = 'draft'` GEWESEN — es gibt
 * sogar noch einen „Jetzt starten"-Knopf dafür (`_ui/Verlauf.tsx`,
 * `StartenKnopf`). Zwei Gründe dagegen, und der zweite wiegt schwerer:
 * `draft` weist der Verlauf ausdrücklich als ALTBESTAND aus (Import und alte
 * Oberfläche), ein geplanter Abend stünde dort als Fremdkörper; und ein
 * geplanter Termin, der noch gar keine Erhebung hat, ist keine halbfertige
 * Umfrage. Hinge die Terminplanung an `surveys`, wäre eine spätere
 * Dienstabendverwaltung (Anwesenheit, Ort, Ausbilder) eine Eigenschaft der
 * Feedback-Erhebung — genau verkehrt herum. Sie ergänzt hier Spalten.
 *
 * `held` ist die Vorgabe, weil jede BESTEHENDE Zeile einen vergangenen Abend
 * meint: der Altbestand wandert damit ohne Rückrechnung in die richtige Lage.
 */
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
    // `$type` statt nacktem `string`: sonst nähme `insertEvening` jede
    // Zeichenkette entgegen und der CHECK der Datenbank wäre die erste Instanz,
    // die es merkt — zur Laufzeit, mitten in einer Transaktion.
    status: text("status").$type<EveningStatus>().notNull().default("held"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [
    index("idx_evenings_group_date").on(t.groupId, t.date),
    check("evenings_status_check", sql`${t.status} IN ('planned','held','cancelled')`),
  ],
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
