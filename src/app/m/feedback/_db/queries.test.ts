import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import * as schema from "./schema";
import {
  memberGroupIdsFor,
  insertGroup,
  insertEvening,
  insertSurvey,
  activateSurvey,
  createAndStartSurvey,
  getSurvey,
  getEvening,
  activeSurveyForGroup,
  insertResponse,
  listResponses,
} from "./queries";
import { computeClosesAt } from "@/app/m/feedback/_lib/lifecycle";
import { STANDARD_QUESTIONS } from "@/app/m/feedback/_lib/questions";

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

// Zählt DIREKT per SQL. activeSurveyForGroup nutzt .get() und liefert bei zwei
// aktiven Umfragen stumm die erste Zeile — eine Assertion darauf würde die
// verletzte Invariante nicht bemerken.
const countActive = (groupId: number): number =>
  (
    sqlite
      .prepare(
        "SELECT COUNT(*) AS c FROM surveys s JOIN evenings e ON e.id = s.evening_id" +
          " WHERE e.group_id = ? AND s.status = 'active'",
      )
      .get(groupId) as { c: number }
  ).c;

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

  it("schließt beim Aktivieren keine aktive Umfrage einer anderen Gruppe (Cross-Group-Isolation)", () => {
    const groupA = mkGroup("A", "a");
    const groupB = mkGroup("B", "b");
    const eA1 = insertEvening(db, { groupId: groupA.id, date: new Date(0), topic: null, notes: null, participantCount: null, createdAt: new Date(0) });
    const eA2 = insertEvening(db, { groupId: groupA.id, date: new Date(0), topic: null, notes: null, participantCount: null, createdAt: new Date(0) });
    const eB = insertEvening(db, { groupId: groupB.id, date: new Date(0), topic: null, notes: null, participantCount: null, createdAt: new Date(0) });
    const sA1 = insertSurvey(db, { eveningId: eA1.id, questions: "[]", closeAfterHours: null, createdAt: new Date(0) });
    const sA2 = insertSurvey(db, { eveningId: eA2.id, questions: "[]", closeAfterHours: null, createdAt: new Date(0) });
    const sB = insertSurvey(db, { eveningId: eB.id, questions: "[]", closeAfterHours: null, createdAt: new Date(0) });
    const now = new Date("2026-04-09T10:00:00Z");
    const closesAt = new Date("2026-04-11T10:00:00Z");

    // Gruppe B aktivieren.
    activateSurvey(db, sB.id, closesAt, now);
    // Gruppe A aktivieren — darf Gruppe B nicht beeinflussen.
    activateSurvey(db, sA1.id, closesAt, now);
    activateSurvey(db, sA2.id, closesAt, now);

    // Gruppe B bleibt unberührt von den Aktivierungen in Gruppe A.
    expect(getSurvey(db, sB.id)!.status).toBe("active");
    expect(activeSurveyForGroup(db, groupB.id)!.survey.id).toBe(sB.id);

    // Innerhalb Gruppe A greift weiterhin die max-1-aktiv-Regel.
    expect(getSurvey(db, sA1.id)!.status).toBe("closed");
    expect(getSurvey(db, sA2.id)!.status).toBe("active");
    expect(activeSurveyForGroup(db, groupA.id)!.survey.id).toBe(sA2.id);
  });
});

describe("createAndStartSurvey", () => {
  const date = new Date("2026-07-20T00:00:00Z");
  const now = new Date("2026-07-24T09:00:00Z");
  const start = (groupId: number, over: Partial<Parameters<typeof createAndStartSurvey>[1]> = {}) =>
    createAndStartSurvey(db, {
      groupId,
      date,
      topic: "Funk",
      notes: null,
      participants: 12,
      closeAfterHours: 48,
      now,
      ...over,
    });

  it("legt Abend und aktive Umfrage in einem Aufruf an", () => {
    const g = mkGroup();
    const { eveningId, surveyId } = start(g.id);

    const eve = getEvening(db, eveningId)!;
    expect(eve.groupId).toBe(g.id);
    expect(eve.date).toEqual(date);
    expect(eve.topic).toBe("Funk");
    expect(eve.participantCount).toBe(12);

    const s = getSurvey(db, surveyId)!;
    expect(s.eveningId).toBe(eveningId);
    expect(s.status).toBe("active");
    expect(s.activatedAt).toEqual(now);
    expect(s.closedAt).toBeNull();
    // Frist hängt am Abend-Tag, nicht an `now` (Task 3).
    expect(s.closesAt).toEqual(computeClosesAt(date, 48));
    expect(JSON.parse(s.questions)).toHaveLength(STANDARD_QUESTIONS.length);
  });

  it("Invariante: zwei Starts derselben Gruppe hinterlassen genau eine aktive Umfrage", () => {
    const g = mkGroup();
    const first = start(g.id);
    const second = start(g.id);

    expect(countActive(g.id)).toBe(1);
    const s1 = getSurvey(db, first.surveyId)!;
    expect(s1.status).toBe("closed");
    expect(s1.closedAt).toEqual(now);
    expect(getSurvey(db, second.surveyId)!.status).toBe("active");
    expect(activeSurveyForGroup(db, g.id)!.survey.id).toBe(second.surveyId);
  });

  it("Isolation: ein Start in Gruppe A schließt keine aktive Umfrage in Gruppe B", () => {
    const groupA = mkGroup("A", "a");
    const groupB = mkGroup("B", "b");
    const inB = start(groupB.id);
    start(groupA.id);
    start(groupA.id);

    expect(countActive(groupB.id)).toBe(1);
    expect(getSurvey(db, inB.surveyId)!.status).toBe("active");
    expect(getSurvey(db, inB.surveyId)!.closedAt).toBeNull();
    expect(countActive(groupA.id)).toBe(1);
  });

  it("Rollback: scheitert das Einfügen der Umfrage, bleibt kein Abend zurück", () => {
    const g = mkGroup();
    sqlite.exec(
      "CREATE TRIGGER fail_survey_insert BEFORE INSERT ON surveys BEGIN SELECT RAISE(ABORT, 'boom'); END;",
    );
    expect(() => start(g.id)).toThrow();
    const evenings = (
      sqlite.prepare("SELECT COUNT(*) AS c FROM evenings WHERE group_id = ?").get(g.id) as {
        c: number;
      }
    ).c;
    expect(evenings).toBe(0);
  });

  it("lässt einen Entwurf (Altbestand) derselben Gruppe unangetastet", () => {
    const g = mkGroup();
    const eOld = insertEvening(db, { groupId: g.id, date: new Date(0), topic: null, notes: null, participantCount: null, createdAt: new Date(0) });
    const draft = insertSurvey(db, { eveningId: eOld.id, questions: "[]", closeAfterHours: null, createdAt: new Date(0) });

    start(g.id);

    const after = getSurvey(db, draft.id)!;
    expect(after.status).toBe("draft");
    expect(after.closedAt).toBeNull();
    expect(after.activatedAt).toBeNull();
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
