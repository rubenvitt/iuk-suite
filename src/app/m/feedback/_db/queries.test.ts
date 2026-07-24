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
  upsertKnownUser,
  listKnownUsers,
  setGroupMembers,
} from "./queries";
import { parseFachgruppen } from "@/core/auth/fachgruppen";
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

// SICHERHEITSGRENZE, keine Abfrage. Jeder Zweig hat hier einen Negativfall:
// ein Fehler in dieser Funktion öffnet fremde Gruppen, kein bloßer Anzeigefehler.
describe("memberGroupIdsFor", () => {
  const assign = (userId: string, groupId: number) =>
    sqlite.prepare("INSERT INTO user_groups (user_id, group_id) VALUES (?, ?)").run(userId, groupId);

  it("liefert die über user_groups zugeordneten Gruppen-IDs", () => {
    const g = mkGroup();
    assign("u1", g.id);
    expect(memberGroupIdsFor(db, "u1", [])).toEqual([g.id]);
    expect(memberGroupIdsFor(db, "other", [])).toEqual([]);
  });

  it("löst Fachgruppen-Slugs aus dem Claim in Gruppen-IDs auf", () => {
    const g = mkGroup("Sanität", "sanitaet");
    expect(memberGroupIdsFor(db, "u1", ["sanitaet"])).toEqual([g.id]);
  });

  // Claim fehlt ganz (leere Liste vom Aufrufer) → nur user_groups, NICHT alle Gruppen.
  it("fehlender Claim → nur user_groups, niemals alle Gruppen", () => {
    const a = mkGroup("A", "a");
    mkGroup("B", "b");
    assign("u1", a.id);
    expect(memberGroupIdsFor(db, "u1", [])).toEqual([a.id]);
  });

  // Claim ist ein leeres Array → dasselbe Ergebnis wie ohne Claim.
  it("leeres Claim-Array → nur user_groups", () => {
    const a = mkGroup("A", "a");
    mkGroup("B", "b");
    assign("u1", a.id);
    const slugs: string[] = [];
    expect(memberGroupIdsFor(db, "u1", slugs)).toEqual([a.id]);
  });

  // Eine Zeichenkette statt eines Arrays wird bereits von parseFachgruppen zu []
  // reduziert. Hier der Beleg, dass auch die Query selbst nicht koerziert und
  // nicht an Trennzeichen zerlegt: "sanitaet,iuk" ist KEIN Treffer auf "sanitaet".
  it("Zeichenkette statt Array → leere Menge, keine Koerzion, kein Split", () => {
    mkGroup("Sanität", "sanitaet");
    mkGroup("IuK", "iuk");
    expect(memberGroupIdsFor(db, "u1", parseFachgruppen({ fachgruppen: "sanitaet" }))).toEqual([]);
    expect(memberGroupIdsFor(db, "u1", ["sanitaet,iuk"])).toEqual([]);
  });

  it("nicht existierender Slug im Claim → keine Zuordnung", () => {
    mkGroup("Sanität", "sanitaet");
    expect(memberGroupIdsFor(db, "u1", ["gibt-es-nicht"])).toEqual([]);
  });

  // Exakter Vergleich: SQLite vergleicht TEXT ohne COLLATE NOCASE case-sensitiv,
  // und das muss so bleiben (kein LIKE, kein lower()).
  it("abweichende Groß-/Kleinschreibung → kein Treffer", () => {
    mkGroup("Sanität", "sanitaet");
    expect(memberGroupIdsFor(db, "u1", ["Sanitaet"])).toEqual([]);
    expect(memberGroupIdsFor(db, "u1", ["SANITAET"])).toEqual([]);
  });

  it("user_groups leer UND Claim leer → keine Gruppe sichtbar", () => {
    mkGroup("A", "a");
    mkGroup("B", "b");
    expect(memberGroupIdsFor(db, "u1", [])).toEqual([]);
  });

  it("Vereinigung: user_groups A + Claim B → beide, jede genau einmal", () => {
    const a = mkGroup("A", "a");
    const b = mkGroup("B", "b");
    assign("u1", a.id);
    const ids = memberGroupIdsFor(db, "u1", ["b"]);
    expect([...ids].sort((x, y) => x - y)).toEqual([a.id, b.id]);
    expect(ids).toHaveLength(2);
  });

  // Dieselbe Gruppe aus BEIDEN Quellen: naives Zusammenhängen liefert [A, A].
  it("dieselbe Gruppe aus beiden Quellen → genau ein Eintrag", () => {
    const a = mkGroup("A", "a");
    assign("u1", a.id);
    expect(memberGroupIdsFor(db, "u1", ["a"])).toEqual([a.id]);
  });

  it("Claim-Treffer gilt nur für die genannten Slugs, nicht für fremde Zuordnungen", () => {
    const a = mkGroup("A", "a");
    const b = mkGroup("B", "b");
    assign("other", a.id);
    expect(memberGroupIdsFor(db, "u1", ["b"])).toEqual([b.id]);
  });
});

describe("Nutzerverzeichnis", () => {
  it("upsertKnownUser ist idempotent und aktualisiert seenAt", () => {
    upsertKnownUser(db, {
      userId: "u1",
      name: "Alt",
      email: "alt@example.org",
      seenAt: new Date("2026-01-01T10:00:00Z"),
    });
    upsertKnownUser(db, {
      userId: "u1",
      name: "Neu",
      email: "neu@example.org",
      seenAt: new Date("2026-02-02T11:00:00Z"),
    });
    const rows = listKnownUsers(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ userId: "u1", name: "Neu", email: "neu@example.org" });
    const seenAt = (
      sqlite.prepare("SELECT seen_at AS s FROM known_users WHERE user_id = 'u1'").get() as {
        s: number;
      }
    ).s;
    expect(seenAt).toBe(new Date("2026-02-02T11:00:00Z").getTime() / 1000);
  });

  it("upsertKnownUser akzeptiert fehlenden Namen und fehlende E-Mail", () => {
    upsertKnownUser(db, { userId: "u1", name: null, email: null, seenAt: new Date(0) });
    expect(listKnownUsers(db)).toEqual([{ userId: "u1", name: null, email: null }]);
  });

  it("listKnownUsers liefert alle Einträge", () => {
    upsertKnownUser(db, { userId: "u1", name: "A", email: null, seenAt: new Date(0) });
    upsertKnownUser(db, { userId: "u2", name: "B", email: null, seenAt: new Date(0) });
    expect(listKnownUsers(db).map((u) => u.userId).sort()).toEqual(["u1", "u2"]);
  });
});

describe("setGroupMembers", () => {
  it("setzt die Zuordnung", () => {
    const g = mkGroup();
    setGroupMembers(db, g.id, ["u1", "u2"]);
    expect(memberGroupIdsFor(db, "u1", [])).toEqual([g.id]);
    expect(memberGroupIdsFor(db, "u2", [])).toEqual([g.id]);
  });

  // Ersetzen, nicht Ergänzen: Entfernen muss funktionieren.
  it("ersetzt die Zuordnung vollständig — Entfernen funktioniert", () => {
    const g = mkGroup();
    setGroupMembers(db, g.id, ["u1", "u2"]);
    setGroupMembers(db, g.id, ["u2"]);
    expect(memberGroupIdsFor(db, "u1", [])).toEqual([]);
    expect(memberGroupIdsFor(db, "u2", [])).toEqual([g.id]);
  });

  it("leere Liste entfernt alle Zuordnungen der Gruppe", () => {
    const g = mkGroup();
    setGroupMembers(db, g.id, ["u1"]);
    setGroupMembers(db, g.id, []);
    expect(memberGroupIdsFor(db, "u1", [])).toEqual([]);
  });

  it("lässt die Zuordnungen anderer Gruppen unberührt", () => {
    const a = mkGroup("A", "a");
    const b = mkGroup("B", "b");
    setGroupMembers(db, a.id, ["u1"]);
    setGroupMembers(db, b.id, ["u1"]);
    setGroupMembers(db, b.id, []);
    expect(memberGroupIdsFor(db, "u1", [])).toEqual([a.id]);
  });

  it("ist mit derselben Liste wiederholt aufrufbar (kein PK-Konflikt)", () => {
    const g = mkGroup();
    setGroupMembers(db, g.id, ["u1", "u1"]);
    setGroupMembers(db, g.id, ["u1"]);
    expect(memberGroupIdsFor(db, "u1", [])).toEqual([g.id]);
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

  /**
   * Altbestand: der Import (scripts/import/feedback.ts) schreibt sekundengenaue
   * Zeitstempel aus der Alt-App und muss Parität halten. `insertResponse`
   * schreibt `at` deshalb unverändert — die Rundung auf das Abenddatum ist
   * Sache des Aufrufers, nicht dieser Funktion.
   */
  it("schreibt den übergebenen Zeitstempel unverändert (Altbestand bleibt sekundengenau lesbar)", () => {
    const g = mkGroup();
    const e = insertEvening(db, { groupId: g.id, date: new Date(0), topic: null, notes: null, participantCount: null, createdAt: new Date(0) });
    const s = insertSurvey(db, { eveningId: e.id, questions: "[]", closeAfterHours: null, createdAt: new Date(0) });
    const secondPrecise = new Date(Date.UTC(2026, 3, 9, 7, 24, 28));
    insertResponse(db, s.id, { q1: 2 }, secondPrecise);
    const rows = listResponses(db, s.id);
    expect(rows[0].submittedAt.getTime()).toBe(secondPrecise.getTime());
  });
});
