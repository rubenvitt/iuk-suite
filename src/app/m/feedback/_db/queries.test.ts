import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { rmSync } from "node:fs";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import * as schema from "./schema";
import {
  memberGroupIdsFor,
  insertGroup,
  listGroups,
  insertEvening,
  insertSurvey,
  activateSurvey,
  getSurvey,
  activeSurveyForGroup,
  insertResponse,
  listResponses,
} from "./queries";

type DB = ReturnType<typeof drizzle<typeof schema>>;
let sqlite: Database.Database;
let db: DB;

beforeEach(() => {
  sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "src/app/m/feedback/_db/migrations" });
});
afterEach(() => sqlite.close());

const mkGroup = (name = "G", slug = "g") =>
  insertGroup(db, { name, slug, secret: "abc12", closeAfterHours: null, createdAt: new Date(0) });

describe("memberGroupIdsFor", () => {
  it("liefert die zugeordneten Gruppen-IDs", () => {
    const g = mkGroup();
    sqlite.prepare("INSERT INTO user_groups (user_id, group_id) VALUES (?, ?)").run("u1", g.id);
    expect(memberGroupIdsFor(db, "u1")).toEqual([g.id]);
    expect(memberGroupIdsFor(db, "other")).toEqual([]);
  });
});

describe("activateSurvey — max. 1 aktive pro Gruppe", () => {
  it("schließt andere aktive Umfragen derselben Gruppe", () => {
    const g = mkGroup();
    const e1 = insertEvening(db, { groupId: g.id, date: new Date(0), topic: null, notes: null, participantCount: null, createdAt: new Date(0) });
    const e2 = insertEvening(db, { groupId: g.id, date: new Date(0), topic: null, notes: null, participantCount: null, createdAt: new Date(0) });
    const s1 = insertSurvey(db, { eveningId: e1.id, questions: "[]", closeAfterHours: null, createdAt: new Date(0) });
    const s2 = insertSurvey(db, { eveningId: e2.id, questions: "[]", closeAfterHours: null, createdAt: new Date(0) });
    const now = new Date("2026-04-09T10:00:00Z");
    activateSurvey(db, s1.id, new Date("2026-04-11T10:00:00Z"), now);
    activateSurvey(db, s2.id, new Date("2026-04-11T10:00:00Z"), now);
    expect(getSurvey(db, s1.id)!.status).toBe("closed"); // durch s2-Aktivierung geschlossen
    expect(getSurvey(db, s2.id)!.status).toBe("active");
    expect(activeSurveyForGroup(db, g.id)!.survey.id).toBe(s2.id);
  });
});

describe("insertResponse / listResponses", () => {
  it("speichert answers als JSON und liest sie zurück", () => {
    const g = mkGroup();
    const e = insertEvening(db, { groupId: g.id, date: new Date(0), topic: null, notes: null, participantCount: null, createdAt: new Date(0) });
    const s = insertSurvey(db, { eveningId: e.id, questions: "[]", closeAfterHours: null, createdAt: new Date(0) });
    insertResponse(db, s.id, { q1: 2, q9: "gut" }, new Date(0));
    const rows = listResponses(db, s.id);
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0].answers)).toEqual({ q1: 2, q9: "gut" });
  });
});
