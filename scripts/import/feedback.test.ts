import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "@/app/m/feedback/_db/schema";
import {
  readSource,
  toNewGroup,
  toNewEvening,
  toNewSurvey,
  toNewResponse,
  toNewUserGroup,
  importFeedback,
  checkFeedbackParity,
  groupParityView,
  eveningParityView,
  surveyParityView,
  responseParityView,
  userGroupParityView,
  type SourceSurveyRow,
} from "./feedback";
import { normalizeTimestamp } from "./feedback-time";
import { checkParity } from "./parity";

const DIR = "./.data/feedback-import-test";

// Alt-DB-Fixture (in-memory): rohes Schema wie da-feedback (Go/SQLite), Zeitstempel
// als TEXT in beiden gemischten Formaten (Go time.Time + SQLite CURRENT_TIMESTAMP).
function buildSourceDb(): Database.Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE groups (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      secret TEXT NOT NULL,
      close_after_hours INTEGER,
      created_at TEXT NOT NULL
    );
    CREATE TABLE evenings (
      id INTEGER PRIMARY KEY,
      group_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      topic TEXT,
      notes TEXT,
      participant_count INTEGER,
      created_at TEXT NOT NULL
    );
    CREATE TABLE surveys (
      id INTEGER PRIMARY KEY,
      evening_id INTEGER NOT NULL,
      status TEXT NOT NULL,
      questions TEXT NOT NULL,
      close_after_hours INTEGER,
      activated_at TEXT,
      closes_at TEXT,
      closed_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE responses (
      id INTEGER PRIMARY KEY,
      survey_id INTEGER NOT NULL,
      answers TEXT NOT NULL,
      submitted_at TEXT NOT NULL
    );
    CREATE TABLE user_groups (
      user_id TEXT NOT NULL,
      group_id INTEGER NOT NULL,
      PRIMARY KEY (user_id, group_id)
    );
  `);

  db.prepare(
    `INSERT INTO groups (id, name, slug, secret, close_after_hours, created_at) VALUES (?,?,?,?,?,?)`,
  ).run(1, "Jugendfeuerwehr", "jf", "s3cr3t1", 48, "2026-04-09 07:24:28");
  db.prepare(
    `INSERT INTO groups (id, name, slug, secret, close_after_hours, created_at) VALUES (?,?,?,?,?,?)`,
  ).run(
    2,
    "Bereitschaft",
    "bereitschaft",
    "s3cr3t2",
    null,
    "2026-04-09 09:24:31.055193 +0200 CEST m=+136.580652293",
  );

  // IDs bewusst disjunkt von group_id (11/12 statt 1/2) — sonst würde eine
  // Feld-Vertauschung `id`↔`group_id` im Mapping unbemerkt bleiben (beide 1).
  db.prepare(
    `INSERT INTO evenings (id, group_id, date, topic, notes, participant_count, created_at) VALUES (?,?,?,?,?,?,?)`,
  ).run(
    11,
    1,
    "2026-04-09 00:00:00 +0000 UTC",
    "Erste Hilfe",
    "gut angenommen",
    12,
    "2026-04-09 07:24:28",
  );
  db.prepare(
    `INSERT INTO evenings (id, group_id, date, topic, notes, participant_count, created_at) VALUES (?,?,?,?,?,?,?)`,
  ).run(
    12,
    2,
    "2026-04-16 09:24:31.055193 +0200 CEST m=+136.580652293",
    null,
    null,
    null,
    "2026-04-09 07:24:28",
  );

  // Alt-Umfrage mit `stars`-Fragetyp — nur im Lese-Pfad relevant, wird als
  // roher JSON-String 1:1 übernommen (nicht re-serialisiert).
  const starsQuestions = JSON.stringify([
    { id: "q1", type: "stars", text: "Wie war der Abend?" },
    { id: "q2", type: "text", text: "Anmerkungen?" },
  ]);
  // id/evening_id ebenfalls disjunkt (21/22 statt 1/2 bzw. 11/12) — selbes Motiv.
  db.prepare(
    `INSERT INTO surveys (id, evening_id, status, questions, close_after_hours, activated_at, closes_at, closed_at, created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  ).run(
    21,
    11,
    "closed",
    starsQuestions,
    24,
    "2026-04-09 09:24:31.055193 +0200 CEST m=+136.580652293",
    "2026-04-10 09:24:31.055193 +0200 CEST m=+136.580652293",
    "2026-04-10 09:30:00.000000 +0200 CEST m=+500.0",
    "2026-04-09 07:24:28",
  );
  const draftQuestions = JSON.stringify([{ id: "q1", type: "schulnote", text: "Wie war der Dienstabend?" }]);
  db.prepare(
    `INSERT INTO surveys (id, evening_id, status, questions, close_after_hours, activated_at, closes_at, closed_at, created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  ).run(22, 12, "draft", draftQuestions, null, null, null, null, "2026-04-09 07:24:28");

  // id/survey_id disjunkt (31/32 statt 1/2, survey_id 21 statt 1) — selbes Motiv.
  db.prepare(`INSERT INTO responses (id, survey_id, answers, submitted_at) VALUES (?,?,?,?)`).run(
    31,
    21,
    JSON.stringify({ q1: 4, q2: "Danke, war gut." }),
    "2026-04-09 09:24:31.055193 +0200 CEST m=+136.580652293",
  );
  db.prepare(`INSERT INTO responses (id, survey_id, answers, submitted_at) VALUES (?,?,?,?)`).run(
    32,
    21,
    JSON.stringify({ q1: 5, q2: "" }),
    "2026-04-09 07:24:28",
  );

  db.prepare(`INSERT INTO user_groups (user_id, group_id) VALUES (?,?)`).run("oidc|user-1", 1);
  db.prepare(`INSERT INTO user_groups (user_id, group_id) VALUES (?,?)`).run("oidc|user-2", 2);

  return db;
}

function freshDb(): BetterSQLite3Database<typeof schema> {
  rmSync(DIR, { recursive: true, force: true });
  mkdirSync(DIR, { recursive: true });
  const db = drizzle(new Database(`${DIR}/feedback.db`), { schema });
  migrate(db, { migrationsFolder: "./src/app/m/feedback/_db/migrations" });
  return db;
}
afterEach(() => rmSync(DIR, { recursive: true, force: true }));

describe("readSource", () => {
  it("liest alle fünf Tabellen im Import-Scope", () => {
    const sourceDb = buildSourceDb();
    const source = readSource(sourceDb);
    sourceDb.close();
    expect(source.groups).toHaveLength(2);
    expect(source.evenings).toHaveLength(2);
    expect(source.surveys).toHaveLength(2);
    expect(source.responses).toHaveLength(2);
    expect(source.userGroups).toHaveLength(2);
  });
});

describe("toNew* Mapping", () => {
  // Jeder Test prüft ALLE Zielfelder gegen konkrete Erwartungswerte (nicht nur
  // Typ-/Null-Checks) — Fixture-Werte sind pro Feld bewusst unterscheidbar, damit
  // eine Feld-Vertauschung oder ein gedropptes Feld im Mapping rot wird.
  it("toNewGroup mappt id/name/slug/secret/closeAfterHours/createdAt 1:1", () => {
    const sourceDb = buildSourceDb();
    const source = readSource(sourceDb);
    sourceDb.close();

    const g1 = toNewGroup(source.groups[0]);
    expect(g1).toEqual({
      id: 1,
      name: "Jugendfeuerwehr",
      slug: "jf",
      secret: "s3cr3t1",
      closeAfterHours: 48,
      createdAt: new Date(normalizeTimestamp("2026-04-09 07:24:28") * 1000),
    });

    const g2 = toNewGroup(source.groups[1]);
    expect(g2).toEqual({
      id: 2,
      name: "Bereitschaft",
      slug: "bereitschaft",
      secret: "s3cr3t2",
      closeAfterHours: null,
      createdAt: new Date(
        normalizeTimestamp("2026-04-09 09:24:31.055193 +0200 CEST m=+136.580652293") * 1000,
      ),
    });
  });

  it("toNewEvening mappt id/groupId/date/topic/notes/participantCount/createdAt 1:1", () => {
    const sourceDb = buildSourceDb();
    const source = readSource(sourceDb);
    sourceDb.close();

    const e1 = toNewEvening(source.evenings[0]);
    expect(e1).toEqual({
      id: 11,
      groupId: 1,
      date: new Date(normalizeTimestamp("2026-04-09 00:00:00 +0000 UTC") * 1000),
      topic: "Erste Hilfe",
      notes: "gut angenommen",
      participantCount: 12,
      createdAt: new Date(normalizeTimestamp("2026-04-09 07:24:28") * 1000),
    });

    const e2 = toNewEvening(source.evenings[1]);
    expect(e2).toEqual({
      id: 12,
      groupId: 2,
      date: new Date(
        normalizeTimestamp("2026-04-16 09:24:31.055193 +0200 CEST m=+136.580652293") * 1000,
      ),
      topic: null,
      notes: null,
      participantCount: null,
      createdAt: new Date(normalizeTimestamp("2026-04-09 07:24:28") * 1000),
    });
  });

  it("toNewSurvey mappt alle Felder 1:1 (closed- und draft-Fall); questions bleibt roher String", () => {
    const sourceDb = buildSourceDb();
    const source = readSource(sourceDb);
    sourceDb.close();

    const survey = toNewSurvey(source.surveys[0] as SourceSurveyRow);
    expect(survey).toEqual({
      id: 21,
      eveningId: 11,
      status: "closed",
      questions: source.surveys[0].questions,
      closeAfterHours: 24,
      activatedAt: new Date(
        normalizeTimestamp("2026-04-09 09:24:31.055193 +0200 CEST m=+136.580652293") * 1000,
      ),
      closesAt: new Date(
        normalizeTimestamp("2026-04-10 09:24:31.055193 +0200 CEST m=+136.580652293") * 1000,
      ),
      closedAt: new Date(normalizeTimestamp("2026-04-10 09:30:00.000000 +0200 CEST m=+500.0") * 1000),
      createdAt: new Date(normalizeTimestamp("2026-04-09 07:24:28") * 1000),
    });
    expect(JSON.parse(survey.questions as string)).toEqual([
      { id: "q1", type: "stars", text: "Wie war der Abend?" },
      { id: "q2", type: "text", text: "Anmerkungen?" },
    ]);

    const draftSurvey = toNewSurvey(source.surveys[1]);
    expect(draftSurvey).toEqual({
      id: 22,
      eveningId: 12,
      status: "draft",
      questions: source.surveys[1].questions,
      closeAfterHours: null,
      activatedAt: null,
      closesAt: null,
      closedAt: null,
      createdAt: new Date(normalizeTimestamp("2026-04-09 07:24:28") * 1000),
    });
  });

  it("toNewResponse mappt id/surveyId/answers/submittedAt 1:1; answers bleibt roher String", () => {
    const sourceDb = buildSourceDb();
    const source = readSource(sourceDb);
    sourceDb.close();

    const response = toNewResponse(source.responses[0]);
    expect(response).toEqual({
      id: 31,
      surveyId: 21,
      answers: source.responses[0].answers,
      submittedAt: new Date(
        normalizeTimestamp("2026-04-09 09:24:31.055193 +0200 CEST m=+136.580652293") * 1000,
      ),
    });
    expect(JSON.parse(response.answers as string)).toEqual({ q1: 4, q2: "Danke, war gut." });

    const response2 = toNewResponse(source.responses[1]);
    expect(response2).toEqual({
      id: 32,
      surveyId: 21,
      answers: source.responses[1].answers,
      submittedAt: new Date(normalizeTimestamp("2026-04-09 07:24:28") * 1000),
    });
  });

  it("toNewUserGroup mappt userId/groupId 1:1", () => {
    const sourceDb = buildSourceDb();
    const source = readSource(sourceDb);
    sourceDb.close();

    const ug1 = toNewUserGroup(source.userGroups[0]);
    expect(ug1).toEqual({ userId: "oidc|user-1", groupId: 1 });

    const ug2 = toNewUserGroup(source.userGroups[1]);
    expect(ug2).toEqual({ userId: "oidc|user-2", groupId: 2 });
  });
});

describe("importFeedback", () => {
  it("importiert alle Zeilen 1:1 — IDs erhalten", () => {
    const sourceDb = buildSourceDb();
    const source = readSource(sourceDb);
    sourceDb.close();
    const db = freshDb();

    const res = importFeedback(source, db);
    expect(res.imported).toBe(2 + 2 + 2 + 2 + 2);

    const groups = db.select().from(schema.groups).all();
    expect(groups.map((g) => g.id).sort()).toEqual([1, 2]);
    const evenings = db.select().from(schema.evenings).all();
    expect(evenings.map((e) => e.id).sort()).toEqual([11, 12]);
    const surveys = db.select().from(schema.surveys).all();
    expect(surveys.map((s) => s.id).sort()).toEqual([21, 22]);
    const responses = db.select().from(schema.responses).all();
    expect(responses.map((r) => r.id).sort()).toEqual([31, 32]);
    const userGroups = db.select().from(schema.userGroups).all();
    expect(userGroups).toHaveLength(2);
  });

  it("questions/answers-JSON bleibt nach dem Import byte-identisch", () => {
    const sourceDb = buildSourceDb();
    const source = readSource(sourceDb);
    sourceDb.close();
    const db = freshDb();
    importFeedback(source, db);

    const storedSurvey = db.select().from(schema.surveys).all().find((s) => s.id === 21)!;
    expect(storedSurvey.questions).toBe(source.surveys[0].questions);
    const storedResponse = db.select().from(schema.responses).all().find((r) => r.id === 31)!;
    expect(storedResponse.answers).toBe(source.responses[0].answers);
  });

  it("ist idempotent — zweiter Import erzeugt keine Duplikate", () => {
    const sourceDb = buildSourceDb();
    const source = readSource(sourceDb);
    sourceDb.close();
    const db = freshDb();

    importFeedback(source, db);
    importFeedback(source, db);

    expect(db.select().from(schema.groups).all()).toHaveLength(2);
    expect(db.select().from(schema.evenings).all()).toHaveLength(2);
    expect(db.select().from(schema.surveys).all()).toHaveLength(2);
    expect(db.select().from(schema.responses).all()).toHaveLength(2);
    expect(db.select().from(schema.userGroups).all()).toHaveLength(2);
  });

  it("Parität ist grün nach einem treuen Import", () => {
    const sourceDb = buildSourceDb();
    const source = readSource(sourceDb);
    sourceDb.close();
    const db = freshDb();

    importFeedback(source, db);
    const report = checkFeedbackParity(source, db);
    expect(report.ok).toBe(true);
    expect(report.missingInTarget).toEqual([]);
    expect(report.missingInSource).toEqual([]);
    expect(report.sourceCount).toBe(report.targetCount);
  });

  it("full-row Parität schlägt fehl, wenn ein Inhaltsfeld im Ziel verändert wird", () => {
    const sourceDb = buildSourceDb();
    const source = readSource(sourceDb);
    sourceDb.close();
    const db = freshDb();
    importFeedback(source, db);

    const stored = db.select().from(schema.groups).all();
    const sourceRows = source.groups.map((r) => groupParityView(toNewGroup(r)));
    const tampered = stored.map((s) => groupParityView({ ...s, name: "CORRUPT" }));
    expect(checkParity(sourceRows, tampered).ok).toBe(false);
  });
});

describe("parityView-Funktionen", () => {
  it("normalisieren Timestamps auf Sekunden und Defaults konsistent für beide Seiten", () => {
    const sourceDb = buildSourceDb();
    const source = readSource(sourceDb);
    sourceDb.close();

    const evening = toNewEvening(source.evenings[1]); // topic/notes/participantCount = null
    const view = eveningParityView(evening);
    expect(view.topic).toBeNull();
    expect(view.notes).toBeNull();
    expect(view.participantCount).toBeNull();
    expect(typeof view.date).toBe("number");

    const response = toNewResponse(source.responses[0]);
    expect(responseParityView(response).submittedAt).toEqual(Math.floor(response.submittedAt.getTime() / 1000));

    const ug = toNewUserGroup(source.userGroups[0]);
    expect(userGroupParityView(ug)).toEqual({ userId: "oidc|user-1", groupId: 1 });

    const survey = toNewSurvey(source.surveys[1]);
    const sview = surveyParityView(survey);
    expect(sview.status).toBe("draft");
    expect(sview.activatedAt).toBeNull();
  });
});
