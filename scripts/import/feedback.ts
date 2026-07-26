import Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { getModuleDb } from "@/core/db";
import { migrateAllModules } from "@/core/bootstrap";
import * as schema from "@/app/m/feedback/_db/schema";
import { normalizeTimestamp } from "./feedback-time";
import { checkParity, assertParity, type ParityReport, type Row } from "./parity";

// Alt-DB (da-feedback, Go/SQLite) — Rohzeilen. Zeitstempel sind TEXT in einem
// der zwei Formate aus feedback-time.ts (Go time.Time oder CURRENT_TIMESTAMP).
export interface SourceGroupRow {
  id: number;
  name: string;
  slug: string;
  secret: string;
  close_after_hours: number | null;
  created_at: string;
}

export interface SourceEveningRow {
  id: number;
  group_id: number;
  date: string;
  topic: string | null;
  notes: string | null;
  participant_count: number | null;
  created_at: string;
}

export interface SourceSurveyRow {
  id: number;
  evening_id: number;
  status: string;
  questions: string; // roher JSON-Snapshot — wird 1:1 übernommen, nicht re-serialisiert
  close_after_hours: number | null;
  activated_at: string | null;
  closes_at: string | null;
  closed_at: string | null;
  created_at: string;
}

export interface SourceResponseRow {
  id: number;
  survey_id: number;
  answers: string; // roher JSON-String {questionId: value} — 1:1 übernommen
  submitted_at: string;
}

export interface SourceUserGroupRow {
  user_id: number | string;
  group_id: number;
}

export interface FeedbackSource {
  groups: SourceGroupRow[];
  evenings: SourceEveningRow[];
  surveys: SourceSurveyRow[];
  responses: SourceResponseRow[];
  userGroups: SourceUserGroupRow[];
}

type FeedbackDb = BetterSQLite3Database<typeof schema>;

// Liest die fünf Tabellen im Import-Scope aus einer geöffneten Alt-SQLite (read-only
// im CLI-Pfad, in-memory-Fixture im Test). Reine Rohdaten, keine Transformation.
export function readSource(sourceDb: Database.Database): FeedbackSource {
  return {
    groups: sourceDb.prepare("SELECT * FROM groups").all() as SourceGroupRow[],
    evenings: sourceDb.prepare("SELECT * FROM evenings").all() as SourceEveningRow[],
    surveys: sourceDb.prepare("SELECT * FROM surveys").all() as SourceSurveyRow[],
    responses: sourceDb.prepare("SELECT * FROM responses").all() as SourceResponseRow[],
    userGroups: sourceDb.prepare("SELECT * FROM user_groups").all() as SourceUserGroupRow[],
  };
}

function tsToDate(raw: string): Date {
  return new Date(normalizeTimestamp(raw) * 1000);
}
function tsToDateOrNull(raw: string | null): Date | null {
  return raw == null ? null : tsToDate(raw);
}

// Alt→Drizzle Mapping, ID 1:1. Reine Funktionen (kein DB-Zugriff).
export function toNewGroup(row: SourceGroupRow): schema.NewGroupRow {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    secret: row.secret,
    closeAfterHours: row.close_after_hours ?? null,
    createdAt: tsToDate(row.created_at),
  };
}

export function toNewEvening(row: SourceEveningRow): schema.NewEveningRow {
  return {
    id: row.id,
    groupId: row.group_id,
    date: tsToDate(row.date),
    topic: row.topic ?? null,
    notes: row.notes ?? null,
    participantCount: row.participant_count ?? null,
    createdAt: tsToDate(row.created_at),
  };
}

export function toNewSurvey(row: SourceSurveyRow): schema.NewSurveyRow {
  return {
    id: row.id,
    eveningId: row.evening_id,
    status: row.status,
    questions: row.questions,
    closeAfterHours: row.close_after_hours ?? null,
    activatedAt: tsToDateOrNull(row.activated_at),
    closesAt: tsToDateOrNull(row.closes_at),
    closedAt: tsToDateOrNull(row.closed_at),
    createdAt: tsToDate(row.created_at),
  };
}

export function toNewResponse(row: SourceResponseRow): schema.NewResponseRow {
  return {
    id: row.id,
    surveyId: row.survey_id,
    answers: row.answers,
    submittedAt: tsToDate(row.submitted_at),
  };
}

export function toNewUserGroup(row: SourceUserGroupRow): schema.NewUserGroupRow {
  return {
    userId: String(row.user_id),
    groupId: row.group_id,
  };
}

// Idempotenter Upsert aller fünf Tabellen per Primärschlüssel.
export function importFeedback(source: FeedbackSource, db: FeedbackDb): { imported: number } {
  let imported = 0;
  for (const row of source.groups) {
    const v = toNewGroup(row);
    db.insert(schema.groups).values(v).onConflictDoUpdate({ target: schema.groups.id, set: v }).run();
    imported++;
  }
  for (const row of source.evenings) {
    const v = toNewEvening(row);
    db.insert(schema.evenings).values(v).onConflictDoUpdate({ target: schema.evenings.id, set: v }).run();
    imported++;
  }
  for (const row of source.surveys) {
    const v = toNewSurvey(row);
    db.insert(schema.surveys).values(v).onConflictDoUpdate({ target: schema.surveys.id, set: v }).run();
    imported++;
  }
  for (const row of source.responses) {
    const v = toNewResponse(row);
    db.insert(schema.responses).values(v).onConflictDoUpdate({ target: schema.responses.id, set: v }).run();
    imported++;
  }
  for (const row of source.userGroups) {
    const v = toNewUserGroup(row);
    db.insert(schema.userGroups)
      .values(v)
      .onConflictDoUpdate({ target: [schema.userGroups.userId, schema.userGroups.groupId], set: v })
      .run();
    imported++;
  }
  return { imported };
}

// drizzle integer(mode:"timestamp") speichert Unix-SEKUNDEN — Sub-Sekunden gehen
// beim Schreiben verloren. Quelle (aus normalizeTimestamp) und Ziel (bereits
// sekundengenau) werden hier gleichermaßen auf Sekunden normalisiert.
function tsSeconds(d: Date | null | undefined): number | null {
  return d ? Math.floor(d.getTime() / 1000) : null;
}

// NB (wie portal.ts): parity zertifiziert DB-Rundtrip-Treue aller Felder — NICHT
// die Korrektheit des Alt→Neu-Mappings (beide Paritäts-Arme laufen durch dieselben
// toNew*-Funktionen, ein Mapping-Bug würde beidseitig identisch hashen). Mapping-
// Korrektheit wird allein durch die toNew*-Unit-Tests abgesichert.
export function groupParityView(r: schema.NewGroupRow | schema.GroupRow) {
  return {
    id: r.id ?? 0,
    name: r.name,
    slug: r.slug,
    secret: r.secret,
    closeAfterHours: r.closeAfterHours ?? null,
    createdAt: tsSeconds(r.createdAt),
  };
}

export function eveningParityView(r: schema.NewEveningRow | schema.EveningRow) {
  return {
    id: r.id ?? 0,
    groupId: r.groupId,
    date: tsSeconds(r.date),
    topic: r.topic ?? null,
    notes: r.notes ?? null,
    participantCount: r.participantCount ?? null,
    createdAt: tsSeconds(r.createdAt),
  };
}

export function surveyParityView(r: schema.NewSurveyRow | schema.SurveyRow) {
  return {
    id: r.id ?? 0,
    eveningId: r.eveningId,
    status: r.status ?? "draft",
    questions: r.questions ?? "[]",
    closeAfterHours: r.closeAfterHours ?? null,
    activatedAt: tsSeconds(r.activatedAt),
    closesAt: tsSeconds(r.closesAt),
    closedAt: tsSeconds(r.closedAt),
    createdAt: tsSeconds(r.createdAt),
  };
}

export function responseParityView(r: schema.NewResponseRow | schema.ResponseRow) {
  return {
    id: r.id ?? 0,
    surveyId: r.surveyId,
    answers: r.answers,
    submittedAt: tsSeconds(r.submittedAt),
  };
}

export function userGroupParityView(r: schema.NewUserGroupRow | schema.UserGroupRow) {
  return {
    userId: r.userId,
    groupId: r.groupId,
  };
}

// Ein Multiset über alle fünf Tabellen, je Zeile mit Tabellen-Tag versehen —
// verhindert Kollisionen zwischen strukturell identischen Zeilen verschiedener
// Tabellen (z. B. leere user_groups- vs. groups-Objekte).
function taggedRows(source: FeedbackSource): Row[] {
  return [
    ...source.groups.map((r) => ({ __table: "groups", ...groupParityView(toNewGroup(r)) })),
    ...source.evenings.map((r) => ({ __table: "evenings", ...eveningParityView(toNewEvening(r)) })),
    ...source.surveys.map((r) => ({ __table: "surveys", ...surveyParityView(toNewSurvey(r)) })),
    ...source.responses.map((r) => ({ __table: "responses", ...responseParityView(toNewResponse(r)) })),
    ...source.userGroups.map((r) => ({ __table: "user_groups", ...userGroupParityView(toNewUserGroup(r)) })),
  ];
}

function taggedTargetRows(db: FeedbackDb): Row[] {
  return [
    ...db.select().from(schema.groups).all().map((r) => ({ __table: "groups", ...groupParityView(r) })),
    ...db.select().from(schema.evenings).all().map((r) => ({ __table: "evenings", ...eveningParityView(r) })),
    ...db.select().from(schema.surveys).all().map((r) => ({ __table: "surveys", ...surveyParityView(r) })),
    ...db.select().from(schema.responses).all().map((r) => ({ __table: "responses", ...responseParityView(r) })),
    ...db.select().from(schema.userGroups).all().map((r) => ({ __table: "user_groups", ...userGroupParityView(r) })),
  ];
}

// Paritätscheck über den gesamten Import-Scope (alle fünf Tabellen in einem
// Multiset, per Tabellen-Tag getrennt).
export function checkFeedbackParity(source: FeedbackSource, db: FeedbackDb): ParityReport {
  return checkParity(taggedRows(source), taggedTargetRows(db));
}

export async function runFeedbackImport(sourceDbPath: string): Promise<void> {
  migrateAllModules();
  const sourceDb = new Database(sourceDbPath, { readonly: true });
  let source: FeedbackSource;
  try {
    source = readSource(sourceDb);
  } finally {
    sourceDb.close();
  }
  const db = getModuleDb("feedback", schema);
  // NB: parity läuft NACH diesem (idempotenten) Schreibvorgang. Ein geworfener
  // Parity-Fehler bedeutet, das Ziel wurde bereits mit den Importzeilen
  // beschrieben — nicht "nichts ist passiert".
  importFeedback(source, db);
  const report = checkFeedbackParity(source, db);
  assertParity(report);
  console.log(`Feedback import OK — ${report.sourceCount} Zeilen, Parität grün.`);
}

// CLI: tsx scripts/import/feedback.ts <alt-feedback.db>   (DATA_DIR steuert das Ziel)
if (import.meta.url === `file://${process.argv[1]}`) {
  const src = process.argv[2];
  if (!src) {
    console.error("usage: tsx scripts/import/feedback.ts <alt-feedback.db>");
    process.exit(1);
  }
  runFeedbackImport(src).catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
