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
 *   „Umfrage starten" entsteht, und die jedes nachgetragenen Abends.
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

/*
 * ── „EHRLICH GESAGT" (IDA-314) ────────────────────────────────────────────────
 *
 * Der Kummerkasten der Bereitschaft: anonyme oder namentliche Mitteilungen an
 * die Vertrauenspersonen (Pocket-ID-Gruppe aus `_lib/ehrlich/zugang.ts`). Eigene
 * Tabellen, eigener öffentlicher Pfad (`k/`), eigener Menüpunkt — fachlich hat er
 * mit Dienstabenden nichts zu tun (Entscheidung 2026-11-01 an IDA-309).
 *
 * WAS DIE ZUSAGE AUF DEM EINWURF DECKT („kein Konto, keine IP, keine Uhrzeit"):
 * - `tag` ist ein Kalendertag `JJJJ-MM-TT` in der Suite-Zone, nie ein Zeitpunkt.
 *   Auch `erledigt_tag` und `gemeldet` (ein Merker statt eines Zeitstempels)
 *   folgen dem — ein „wann gepusht" auf die Minute verriete die Einwurfszeit.
 * - Keine Spalte nimmt eine IP, ein Konto oder eine Sitzung auf; die IP dient nur
 *   der flüchtigen Ratenbegrenzung im Speicher (`README.md`).
 * - Mitteilungen und Gesprächsnachrichten sind im Audit `anonymous` (Migration
 *   0004): ohne Akteur, ohne Objektbezug — sonst stünde neben der Kennung einer
 *   Mitteilung der genaue Zeitpunkt ihres Eingangs im Protokoll.
 * - Der Abholcode steht nie im Klartext in der Datenbank, nur sein SHA-256.
 */
export const ehrlichKasten = sqliteTable("ehrlich_kasten", {
  // Genau eine Zeile: ein Kasten für die ganze Bereitschaft.
  id: integer("id").primaryKey(),
  secret: text("secret").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export type EhrlichAntwortweg = "keine" | "code" | "name";
export type EhrlichStatus = "neu" | "bearbeitung" | "erledigt";

export const ehrlichMitteilungen = sqliteTable(
  "ehrlich_mitteilungen",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tag: text("tag").notNull(),
    thema: text("thema"),
    text: text("text").notNull(),
    antwortweg: text("antwortweg").$type<EhrlichAntwortweg>().notNull(),
    name: text("name"),
    kontakt: text("kontakt"),
    codeHash: text("code_hash"),
    status: text("status").$type<EhrlichStatus>().notNull().default("neu"),
    rueckfrageErlaubt: integer("rueckfrage_erlaubt", { mode: "boolean" }).notNull().default(false),
    erledigtTag: text("erledigt_tag"),
    gemeldet: integer("gemeldet", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [
    uniqueIndex("idx_ehrlich_mitteilungen_code").on(t.codeHash),
    index("idx_ehrlich_mitteilungen_tag").on(t.tag),
    check("ehrlich_mitteilungen_antwortweg_check", sql`${t.antwortweg} IN ('keine','code','name')`),
    check("ehrlich_mitteilungen_status_check", sql`${t.status} IN ('neu','bearbeitung','erledigt')`),
  ],
);

/** Das Gespräch unter dem Abholcode: Antworten der Vertrauenspersonen und Rückfragen der Person. */
export const ehrlichNachrichten = sqliteTable(
  "ehrlich_nachrichten",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    mitteilungId: integer("mitteilung_id")
      .notNull()
      .references(() => ehrlichMitteilungen.id, { onDelete: "cascade" }),
    von: text("von").$type<"vp" | "person">().notNull(),
    // Name der Vertrauensperson; nur in der Verwaltung sichtbar, nie unter dem Code.
    autor: text("autor"),
    text: text("text").notNull(),
    tag: text("tag").notNull(),
    gemeldet: integer("gemeldet", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [
    index("idx_ehrlich_nachrichten_mitteilung").on(t.mitteilungId),
    check("ehrlich_nachrichten_von_check", sql`${t.von} IN ('vp','person')`),
  ],
);

/** Interne Notizen der Vertrauenspersonen. `kontakt` markiert den Vermerk „kontaktiert". */
export const ehrlichNotizen = sqliteTable(
  "ehrlich_notizen",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    mitteilungId: integer("mitteilung_id")
      .notNull()
      .references(() => ehrlichMitteilungen.id, { onDelete: "cascade" }),
    autor: text("autor").notNull(),
    text: text("text").notNull(),
    tag: text("tag").notNull(),
    kontakt: integer("kontakt", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [index("idx_ehrlich_notizen_mitteilung").on(t.mitteilungId)],
);

export type EhrlichMitteilungRow = typeof ehrlichMitteilungen.$inferSelect;
export type EhrlichNachrichtRow = typeof ehrlichNachrichten.$inferSelect;
export type EhrlichNotizRow = typeof ehrlichNotizen.$inferSelect;
