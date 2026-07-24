import { and, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import {
  groups,
  evenings,
  surveys,
  responses,
  userGroups,
  type GroupRow,
  type EveningRow,
  type SurveyRow,
  type ResponseRow,
} from "./schema";
import type { SurveyStatus } from "@/app/m/feedback/_lib/lifecycle";

type DB = BetterSQLite3Database<typeof schema>;

export function memberGroupIdsFor(db: DB, sub: string): number[] {
  return db
    .select({ groupId: userGroups.groupId })
    .from(userGroups)
    .where(eq(userGroups.userId, sub))
    .all()
    .map((r) => r.groupId);
}
// onConflictDoNothing: (userId, groupId) ist Primary Key — ein erneuter Seed-
// Lauf darf nicht auf einer bereits vorhandenen Zuordnung scheitern.
export function insertUserGroup(db: DB, userId: string, groupId: number): void {
  db.insert(userGroups).values({ userId, groupId }).onConflictDoNothing().run();
}

export function listGroups(db: DB): GroupRow[] {
  return db.select().from(groups).all();
}
export function getGroup(db: DB, id: number): GroupRow | undefined {
  return db.select().from(groups).where(eq(groups.id, id)).get();
}
export function getGroupBySlug(db: DB, slug: string): GroupRow | undefined {
  return db.select().from(groups).where(eq(groups.slug, slug)).get();
}
export function insertGroup(
  db: DB,
  v: { name: string; slug: string; secret: string; closeAfterHours: number | null; createdAt: Date },
): GroupRow {
  return db.insert(groups).values(v).returning().get();
}
export function updateGroup(
  db: DB,
  id: number,
  patch: Partial<{ name: string; slug: string; closeAfterHours: number | null }>,
): void {
  db.update(groups).set(patch).where(eq(groups.id, id)).run();
}
export function setGroupSecret(db: DB, id: number, secret: string): void {
  db.update(groups).set({ secret }).where(eq(groups.id, id)).run();
}
export function deleteGroup(db: DB, id: number): void {
  db.delete(groups).where(eq(groups.id, id)).run();
}

export function listEvenings(db: DB, groupId: number): EveningRow[] {
  return db.select().from(evenings).where(eq(evenings.groupId, groupId)).all();
}
export function getEvening(db: DB, id: number): EveningRow | undefined {
  return db.select().from(evenings).where(eq(evenings.id, id)).get();
}
export function insertEvening(
  db: DB,
  v: { groupId: number; date: Date; topic: string | null; notes: string | null; participantCount: number | null; createdAt: Date },
): EveningRow {
  return db.insert(evenings).values(v).returning().get();
}
export function updateEvening(
  db: DB,
  id: number,
  patch: Partial<{ date: Date; topic: string | null; notes: string | null; participantCount: number | null }>,
): void {
  db.update(evenings).set(patch).where(eq(evenings.id, id)).run();
}
export function deleteEvening(db: DB, id: number): void {
  db.delete(evenings).where(eq(evenings.id, id)).run();
}

export function getSurveyByEvening(db: DB, eveningId: number): SurveyRow | undefined {
  return db.select().from(surveys).where(eq(surveys.eveningId, eveningId)).get();
}
export function getSurvey(db: DB, id: number): SurveyRow | undefined {
  return db.select().from(surveys).where(eq(surveys.id, id)).get();
}
export function insertSurvey(
  db: DB,
  v: { eveningId: number; questions: string; closeAfterHours: number | null; createdAt: Date },
): SurveyRow {
  return db.insert(surveys).values({ ...v, status: "draft" }).returning().get();
}
export function setSurveyStatus(
  db: DB,
  id: number,
  status: SurveyStatus,
  patch: Partial<{ activatedAt: Date | null; closesAt: Date | null; closedAt: Date | null }> = {},
): void {
  db.update(surveys).set({ status, ...patch }).where(eq(surveys.id, id)).run();
}

/**
 * Aktiviert eine Umfrage und schließt in derselben Transaktion alle anderen
 * aktiven Umfragen derselben Gruppe (Invariante „max. 1 aktiv pro Gruppe",
 * store.go:99-108). Gruppenbezug via evening.group_id.
 */
export function activateSurvey(db: DB, surveyId: number, closesAt: Date, now: Date): void {
  db.transaction((tx) => {
    const target = tx.select().from(surveys).where(eq(surveys.id, surveyId)).get();
    if (!target) throw new Error("survey not found");
    const eve = tx.select().from(evenings).where(eq(evenings.id, target.eveningId)).get();
    if (!eve) throw new Error("evening not found");
    // Andere aktive Umfragen derselben Gruppe schließen.
    const sameGroupEvenings = tx
      .select({ id: evenings.id })
      .from(evenings)
      .where(eq(evenings.groupId, eve.groupId))
      .all()
      .map((r) => r.id);
    for (const eid of sameGroupEvenings) {
      const s = tx.select().from(surveys).where(eq(surveys.eveningId, eid)).get();
      if (s && s.id !== surveyId && s.status === "active") {
        tx.update(surveys).set({ status: "closed", closedAt: now }).where(eq(surveys.id, s.id)).run();
      }
    }
    tx.update(surveys)
      .set({ status: "active", activatedAt: now, closesAt, closedAt: null })
      .where(eq(surveys.id, surveyId))
      .run();
  });
}

export function activeSurveyForGroup(
  db: DB,
  groupId: number,
): { survey: SurveyRow; evening: EveningRow } | undefined {
  const rows = db
    .select({ survey: surveys, evening: evenings })
    .from(surveys)
    .innerJoin(evenings, eq(surveys.eveningId, evenings.id))
    .where(and(eq(evenings.groupId, groupId), eq(surveys.status, "active")))
    .get();
  return rows ?? undefined;
}

export function listResponses(db: DB, surveyId: number): ResponseRow[] {
  return db.select().from(responses).where(eq(responses.surveyId, surveyId)).all();
}
export function insertResponse(
  db: DB,
  surveyId: number,
  answers: Record<string, unknown>,
  at: Date,
): void {
  db.insert(responses).values({ surveyId, answers: JSON.stringify(answers), submittedAt: at }).run();
}
