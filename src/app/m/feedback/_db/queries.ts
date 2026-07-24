import { and, eq, inArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import {
  groups,
  evenings,
  surveys,
  responses,
  userGroups,
  knownUsers,
  type GroupRow,
  type EveningRow,
  type SurveyRow,
  type ResponseRow,
} from "./schema";
import { computeClosesAt, type SurveyStatus } from "@/app/m/feedback/_lib/lifecycle";
import { STANDARD_QUESTIONS } from "@/app/m/feedback/_lib/questions";

type DB = BetterSQLite3Database<typeof schema>;

/**
 * DIE Sicherheitsgrenze, keine Abfrage: speist `assertGroupAccess`. Vereinigung
 * aus zwei Quellen, absichtlich in dieser Reihenfolge gedacht:
 *
 * 1. `user_groups` — im Werkzeug gepflegte Zuordnung.
 * 2. `fachgruppenSlugs` — das Attribut aus Pocket ID (signiertes ID-Token),
 *    exakter Abgleich gegen `groups.slug`.
 *
 * Der dritte Parameter ist mit Absicht PFLICHT und hat keinen Vorgabewert: ein
 * `[]`-Default würde das sicherheitsrelevante Argument an jeder Aufrufstelle
 * still weglassbar machen — aus einem Übersetzungsfehler würde eine Lücke.
 *
 * Eine leere Slug-Liste degradiert auf `user_groups` allein — NIEMALS auf „alle
 * Gruppen". Deshalb der frühe Ausstieg: kein Codepfad, auf dem eine leere Liste
 * in ein `IN ()` läuft. Verglichen wird exakt und Groß-/Kleinschreibung
 * beachtend (SQLite-TEXT ohne COLLATE NOCASE, kein LIKE, kein lower()).
 */
export function memberGroupIdsFor(db: DB, sub: string, fachgruppenSlugs: string[]): number[] {
  const assigned = db
    .select({ groupId: userGroups.groupId })
    .from(userGroups)
    .where(eq(userGroups.userId, sub))
    .all()
    .map((r) => r.groupId);
  if (fachgruppenSlugs.length === 0) return [...new Set(assigned)];
  const fromClaim = db
    .select({ id: groups.id })
    .from(groups)
    .where(inArray(groups.slug, fachgruppenSlugs))
    .all()
    .map((r) => r.id);
  // Set, nicht Concat: dieselbe Gruppe kann aus BEIDEN Quellen kommen, und
  // Duplikate schlagen später als doppelte Zeilen in Listen durch.
  return [...new Set([...assigned, ...fromClaim])];
}
// onConflictDoNothing: (userId, groupId) ist Primary Key — ein erneuter Seed-
// Lauf darf nicht auf einer bereits vorhandenen Zuordnung scheitern.
export function insertUserGroup(db: DB, userId: string, groupId: number): void {
  db.insert(userGroups).values({ userId, groupId }).onConflictDoNothing().run();
}

/**
 * ERSETZT die Zuordnung einer Gruppe vollständig — Entfernen muss genauso
 * funktionieren wie Hinzufügen, sonst wäre eine Fehlzuordnung nur noch per
 * Datenbankzugriff korrigierbar. Das `delete` ist auf `groupId` eingegrenzt;
 * andere Gruppen bleiben unberührt. Beides in einer Transaktion, damit kein
 * Zwischenzustand ohne Zuordnung sichtbar wird.
 */
export function setGroupMembers(db: DB, groupId: number, userIds: string[]): void {
  db.transaction((tx) => {
    tx.delete(userGroups).where(eq(userGroups.groupId, groupId)).run();
    const unique = [...new Set(userIds)];
    if (unique.length > 0) {
      tx.insert(userGroups)
        .values(unique.map((userId) => ({ userId, groupId })))
        .run();
    }
  });
}

// Idempotent auf `user_id` (Primärschlüssel): jeder Besuch aktualisiert Name,
// E-Mail und `seen_at`, legt aber keinen zweiten Datensatz an.
export function upsertKnownUser(
  db: DB,
  u: { userId: string; name: string | null; email: string | null; seenAt: Date },
): void {
  db.insert(knownUsers)
    .values(u)
    .onConflictDoUpdate({
      target: knownUsers.userId,
      set: { name: u.name, email: u.email, seenAt: u.seenAt },
    })
    .run();
}

// Ohne `seenAt`: die Zuordnungs-Oberfläche braucht eine Namensliste, kein
// Anwesenheitsprotokoll.
export function listKnownUsers(
  db: DB,
): Array<{ userId: string; name: string | null; email: string | null }> {
  return db
    .select({ userId: knownUsers.userId, name: knownUsers.name, email: knownUsers.email })
    .from(knownUsers)
    .all();
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

/**
 * Anlegen IST Starten: Abend und aktive Umfrage entstehen in EINER Transaktion.
 * Schließt dabei alle aktiven Umfragen derselben Gruppe (Invariante „max. 1 aktiv
 * pro Gruppe"). Ein DB-seitiger Riegel ist nicht möglich, weil `surveys` kein
 * group_id trägt — der Gruppenbezug hängt an `evenings`. Bei zwei aktiven
 * Umfragen liefert `activeSurveyForGroup` per `.get()` stumm eine beliebige,
 * der gedruckte QR-Code zeigte dann auf die falsche Erhebung.
 */
export function createAndStartSurvey(
  db: DB,
  input: {
    groupId: number;
    date: Date;
    topic: string | null;
    notes: string | null;
    participants: number | null;
    closeAfterHours: number;
    now: Date;
  },
): { eveningId: number; surveyId: number } {
  return db.transaction((tx) => {
    const eve = tx
      .insert(evenings)
      .values({
        groupId: input.groupId,
        date: input.date,
        topic: input.topic,
        notes: input.notes,
        participantCount: input.participants,
        createdAt: input.now,
      })
      .returning()
      .get();
    // Reihenfolge ist tragend: erst die Geschwister schließen, dann die neue
    // Umfrage einfügen — sonst schließt dieser Schritt sie gleich mit.
    // Nur `active` wird angefasst; `draft`/`archived` aus dem Altbestand bleiben.
    const groupEveningIds = tx
      .select({ id: evenings.id })
      .from(evenings)
      .where(eq(evenings.groupId, input.groupId))
      .all()
      .map((r) => r.id);
    tx.update(surveys)
      .set({ status: "closed", closedAt: input.now })
      .where(and(eq(surveys.status, "active"), inArray(surveys.eveningId, groupEveningIds)))
      .run();
    const survey = tx
      .insert(surveys)
      .values({
        eveningId: eve.id,
        status: "active",
        questions: JSON.stringify(STANDARD_QUESTIONS),
        closeAfterHours: input.closeAfterHours,
        activatedAt: input.now,
        closesAt: computeClosesAt(input.date, input.closeAfterHours),
        closedAt: null,
        createdAt: input.now,
      })
      .returning()
      .get();
    return { eveningId: eve.id, surveyId: survey.id };
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

/**
 * Bewusst ohne `ORDER BY`: die Ausgabeordnung ist keine Zusage dieser Funktion.
 * Wer Antworten Menschen zeigt (Auswertung, CSV-Export), mischt sie über
 * `shuffleStable` (aggregation.ts) durch — Entwurf 3.9.
 */
export function listResponses(db: DB, surveyId: number): ResponseRow[] {
  return db.select().from(responses).where(eq(responses.surveyId, surveyId)).all();
}
/**
 * `at` ist NICHT der Abgabezeitpunkt: der öffentliche Pfad übergibt Mitternacht
 * UTC des Abenddatums, damit die Zeile keine Uhrzeit trägt (Entwurf 3.9,
 * Siegeltext "keine Uhrzeit"). Die Rundung bleibt beim Aufrufer, weil der
 * Import (scripts/import/feedback.ts) die sekundengenauen Alt-Zeitstempel
 * unverändert behalten muss (Parität).
 */
export function insertResponse(
  db: DB,
  surveyId: number,
  answers: Record<string, unknown>,
  at: Date,
): void {
  db.insert(responses).values({ surveyId, answers: JSON.stringify(answers), submittedAt: at }).run();
}
