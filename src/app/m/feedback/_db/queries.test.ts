import { registerAuditFunctions } from "@/core/audit/context";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import * as schema from "./schema";
import {
  memberGroupIdsFor,
  insertGroup,
  insertEvening,
  listEvenings,
  planEvenings,
  setEveningStatus,
  releaseSurveyForEvening,
  insertSurvey,
  activateSurvey,
  createAndStartSurvey,
  getSurvey,
  getSurveyByEvening,
  getEvening,
  activeSurveyForGroup,
  latestSurveyForGroup,
  insertResponse,
  listResponses,
  upsertKnownUser,
  listKnownUsers,
  setGroupMembers,
  listGroupMembers,
} from "./queries";
import { parseFachgruppen } from "@/core/auth/fachgruppen";
import { computeClosesAt, type EveningStatus } from "@/app/m/feedback/_lib/lifecycle";
import { STANDARD_QUESTIONS } from "@/app/m/feedback/_lib/questions";

type DB = ReturnType<typeof drizzle<typeof schema>>;
let sqlite: Database.Database;
let db: DB;

beforeEach(() => {
  sqlite = new Database(":memory:");
  registerAuditFunctions(sqlite);
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

/**
 * DIE GEGENRICHTUNG zu `memberGroupIdsFor` — und der Grund, warum sie existieren
 * muss: `setGroupMembers` ERSETZT die Liste. Die Zuordnungs-Oberfläche darf die
 * gewünschte Liste deshalb nicht vom Client geschickt bekommen (das wäre
 * Mass-Assignment: ein manipulierter Formularwert würde die ganze Leitung einer
 * Gruppe austauschen). Sie liest den Ist-Stand hier serverseitig und rechnet
 * eine Kennung dazu bzw. weg.
 */
describe("listGroupMembers", () => {
  it("liefert die Kennungen genau dieser Gruppe", () => {
    const a = mkGroup("A", "a");
    const b = mkGroup("B", "b");
    setGroupMembers(db, a.id, ["u1", "u2"]);
    setGroupMembers(db, b.id, ["u3"]);
    expect(listGroupMembers(db, a.id).sort()).toEqual(["u1", "u2"]);
    expect(listGroupMembers(db, b.id)).toEqual(["u3"]);
  });

  it("liefert eine leere Liste, nicht undefined, wenn niemand zugeordnet ist", () => {
    const g = mkGroup();
    expect(listGroupMembers(db, g.id)).toEqual([]);
  });
});

/**
 * Fund 1.5/3: `listEvenings` hatte kein `ORDER BY` — die Reihenfolge war die
 * Einfüge-/Rowid-Reihenfolge. Wer einen älteren Abend NACHTRÄGT, bekam ihn ohne
 * Fehlermeldung an das falsche Ende der Tabelle. Der Verlauf verlässt sich auf
 * die Ordnung der Abfrage.
 */
describe("listEvenings — Datum absteigend", () => {
  const abend = (groupId: number, iso: string) =>
    insertEvening(db, {
      groupId,
      date: new Date(iso),
      topic: iso,
      notes: null,
      participantCount: null,
      createdAt: new Date(0),
    });

  it("sortiert nach Datum absteigend, nicht nach Einfügereihenfolge", () => {
    const g = mkGroup();
    // Einfügereihenfolge bewusst umgekehrt: der älteste Abend wird zuletzt
    // nachgetragen — genau der Fall, der vorher still falsch sortierte.
    abend(g.id, "2026-07-15T00:00:00Z");
    abend(g.id, "2026-07-22T00:00:00Z");
    const nachgetragen = abend(g.id, "2026-07-01T00:00:00Z");

    const dates = listEvenings(db, g.id).map((e) => e.date.toISOString().slice(0, 10));
    expect(dates).toEqual(["2026-07-22", "2026-07-15", "2026-07-01"]);
    // Der nachgetragene älteste Abend steht am Ende, obwohl er die höchste rowid hat.
    expect(listEvenings(db, g.id).at(-1)!.id).toBe(nachgetragen.id);
  });

  it("liefert nur die Abende der eigenen Gruppe", () => {
    const a = mkGroup("A", "a");
    const b = mkGroup("B", "b");
    abend(a.id, "2026-07-10T00:00:00Z");
    abend(b.id, "2026-07-20T00:00:00Z");
    expect(listEvenings(db, a.id).map((e) => e.groupId)).toEqual([a.id]);
  });
});

/**
 * VORAUSGEPLANTE ABENDE (DRK-426). Jeder Fall hier ist einer, der still falsch
 * wird: ein doppelt angelegter Dienstabend trägt zwei Auswertungen, die
 * nachträglich nicht mehr zusammenzuführen sind, und ein ausgelassener Termin
 * ist ohne `uebersprungen` ein Verlust, den niemand sieht.
 */
describe("planEvenings", () => {
  const tag = (iso: string) => new Date(`${iso}T00:00:00Z`);
  const NOW = new Date("2026-09-01T18:00:00Z");
  const plane = (groupId: number, isoTage: string[], topic: string | null = "Funkübung") =>
    planEvenings(db, { groupId, dates: isoTage.map(tag), topic, now: NOW });

  it("legt mehrere Abende als `planned` an — mit Thema, ohne Umfrage", () => {
    const g = mkGroup();
    const { angelegt, uebersprungen } = plane(g.id, ["2026-10-06", "2026-10-13", "2026-10-20"]);

    expect(uebersprungen).toBe(0);
    expect(angelegt.map((e) => e.date.toISOString().slice(0, 10))).toEqual([
      "2026-10-06",
      "2026-10-13",
      "2026-10-20",
    ]);
    // `planned`, nicht `held`: an diesem Abend war noch kein Dienst. Stünde er
    // auf `held`, wäre er von einem nachgetragenen Abend nicht zu unterscheiden.
    expect(angelegt.every((e) => e.status === "planned")).toBe(true);
    expect(angelegt.every((e) => e.topic === "Funkübung")).toBe(true);
    // KEINE Umfrage: der gedruckte QR-Code der Gruppe gilt für einen geplanten
    // Abend nicht, freigegeben wird am Abend selbst.
    expect(angelegt.every((e) => getSurveyByEvening(db, e.id) === undefined)).toBe(true);
    // Und keine Teilnehmerzahl: der Nenner ist erst am Abend bekannt.
    expect(angelegt.every((e) => e.participantCount === null)).toBe(true);
    expect(listEvenings(db, g.id)).toHaveLength(3);
  });

  /**
   * Der Kern der Auslassregel: entscheidend ist, DASS an jenem Tag ein Abend
   * steht, nicht in welcher Lage. Ein gelaufener Abend ist der stärkste Grund
   * (dort wurde bereits Feedback erhoben), ein abgesagter der unscheinbarste —
   * würde er überschrieben, verschwände die Auskunft „an dem Tag war kein
   * Dienst" hinter einem neuen Termin.
   */
  it("überspringt ein belegtes Datum, gleich welchen Status der Abend dort trägt", () => {
    const g = mkGroup();
    const bestand = [
      { iso: "2026-10-06", status: "held" as const },
      { iso: "2026-10-13", status: "planned" as const },
      { iso: "2026-10-20", status: "cancelled" as const },
    ];
    for (const b of bestand) {
      insertEvening(db, { groupId: g.id, date: tag(b.iso), topic: "Bestand", notes: null, participantCount: null, status: b.status, createdAt: new Date(0) });
    }

    const { angelegt, uebersprungen } = plane(g.id, [
      ...bestand.map((b) => b.iso),
      "2026-10-27",
    ]);

    expect(uebersprungen).toBe(3);
    expect(angelegt.map((e) => e.date.toISOString().slice(0, 10))).toEqual(["2026-10-27"]);
    // Die drei bestehenden Abende bleiben, wie sie waren — überspringen heißt
    // nicht anfassen.
    expect(listEvenings(db, g.id).map((e) => e.status).sort()).toEqual([
      "cancelled",
      "held",
      "planned",
      "planned",
    ]);
    expect(listEvenings(db, g.id).filter((e) => e.topic === "Bestand")).toHaveLength(3);
  });

  it("überspringt auch einen Altbestands-Abend MIT Uhrzeit — verglichen wird der Kalendertag", () => {
    // ⚠️ DAS IST DER FALL, DER DIE REGEL FAST GEKOSTET HÄTTE. `evenings.date`
    // SOLL Mitternacht UTC tragen, aber der Import erzwingt das nicht: er reicht
    // den Alt-Zeitstempel durch, und die Fixture in
    // `scripts/import/feedback.test.ts` führt genau so einen Abend. Würde hier
    // über `getTime()` verglichen, stünden nach der Planung zwei Abende an
    // einem Tag — still, und nicht mehr zusammenzuführen.
    const g = mkGroup();
    insertEvening(db, {
      groupId: g.id,
      date: new Date("2026-04-16T07:24:31.000Z"),
      topic: "Aus dem Import",
      notes: null,
      participantCount: null,
      status: "held",
      createdAt: new Date(0),
    });

    const { angelegt, uebersprungen } = plane(g.id, ["2026-04-16", "2026-04-23"]);

    expect(uebersprungen).toBe(1);
    expect(angelegt.map((e) => e.date.toISOString().slice(0, 10))).toEqual(["2026-04-23"]);
    expect(listEvenings(db, g.id)).toHaveLength(2);
  });

  it("überspringt einen Abend aus der frühen NACHT — gerechnet wird der Berliner Tag, nicht der UTC-Tag", () => {
    // ⚠️ DIE ZWEITE HÄLFTE DERSELBEN REGEL, und sie ist stiller als die erste:
    // der Kalendertag allein genügt nicht, es muss der Kalendertag in
    // `Europe/Berlin` sein. `2026-04-16 00:30 +0200` steht als
    // `2026-04-15T22:30Z` in der Datenbank — in UTC der 15., auf jedem
    // Bildschirm der Suite der 16. Rechnete die Entdopplung in UTC, träfe der
    // geplante Termin für den 16. diesen Abend NICHT: zwei Abende an einem Tag,
    // zwei Auswertungen, nachträglich nicht mehr zusammenzuführen — und die
    // Oberfläche zeigte beide unter demselben Datum, ohne dass jemand die
    // Ursache sähe. Der Test unterscheidet damit genau das, was
    // `kalendertagInZone` (`_lib/lifecycle.ts`) von `toISOString().slice(0, 10)`
    // trennt; die vorige Zusicherung hier wäre in BEIDEN Fassungen grün.
    const g = mkGroup();
    insertEvening(db, {
      groupId: g.id,
      date: new Date("2026-04-15T22:30:00.000Z"),
      topic: "Aus dem Import, kurz nach Mitternacht",
      notes: null,
      participantCount: null,
      status: "held",
      createdAt: new Date(0),
    });

    const { angelegt, uebersprungen } = plane(g.id, ["2026-04-16", "2026-04-23"]);

    expect(uebersprungen).toBe(1);
    expect(angelegt.map((e) => e.date.toISOString().slice(0, 10))).toEqual(["2026-04-23"]);
    // Zwei Zeilen, nicht drei: der 16. steht genau einmal in der Gruppe.
    expect(listEvenings(db, g.id)).toHaveLength(2);
  });

  it("ein Abend desselben Tages in einer ANDEREN Gruppe hält nicht auf", () => {
    // Die Belegung wird je Gruppe gerechnet. Ohne den Gruppenfilter plante die
    // erste Bereitschaft, die einen Dienstag belegt, ihn für alle anderen weg.
    const a = mkGroup("A", "a");
    const b = mkGroup("B", "b");
    insertEvening(db, { groupId: b.id, date: tag("2026-10-06"), topic: null, notes: null, participantCount: null, status: "planned", createdAt: new Date(0) });

    const { angelegt, uebersprungen } = plane(a.id, ["2026-10-06"]);

    expect(uebersprungen).toBe(0);
    expect(angelegt).toHaveLength(1);
    expect(angelegt[0].groupId).toBe(a.id);
    expect(listEvenings(db, b.id)).toHaveLength(1);
  });

  it("ist idempotent: dieselbe Liste zweimal ergibt beim zweiten Mal 0 Abende", () => {
    // Der Alltagsfall, nicht der Grenzfall: der Browser lädt nach dem Absenden
    // neu, oder jemand plant im Februar dieselbe Jahresserie nach.
    const g = mkGroup();
    const isoTage = ["2026-10-06", "2026-10-13", "2026-10-20"];
    plane(g.id, isoTage);

    const zweiter = plane(g.id, isoTage);

    expect(zweiter.angelegt).toEqual([]);
    expect(zweiter.uebersprungen).toBe(3);
    expect(listEvenings(db, g.id)).toHaveLength(3);
  });
});

/**
 * FREIGEBEN — der dritte Weg in „eine Umfrage läuft". Er ist der einzige, bei
 * dem Abend und Klick Tage auseinanderliegen können, und deshalb der einzige,
 * an dem sich ein Frist-Anker am Klickzeitpunkt nicht von selbst verrät.
 */
describe("releaseSurveyForEvening", () => {
  const tag = (iso: string) => new Date(`${iso}T00:00:00Z`);
  const ABEND = tag("2026-10-06");
  // 19:30 desselben Tages: so spät, wie eine Bereitschaft tatsächlich freigibt.
  const NOW = new Date("2026-10-06T19:30:00Z");
  const geplanterAbend = (groupId: number, date = ABEND) =>
    insertEvening(db, { groupId, date, topic: "Kartenkunde", notes: null, participantCount: null, status: "planned", createdAt: new Date(0) });
  const anzahlUmfragen = (eveningId: number): number =>
    (
      sqlite
        .prepare("SELECT COUNT(*) AS c FROM surveys WHERE evening_id = ?")
        .get(eveningId) as { c: number }
    ).c;

  it("legt eine aktive Umfrage an, setzt den Abend auf `held` und ankert die Frist am Abenddatum", () => {
    const g = mkGroup();
    const eve = geplanterAbend(g.id);

    const survey = releaseSurveyForEvening(db, {
      eveningId: eve.id,
      closeAfterHours: 48,
      now: NOW,
    });

    expect(survey.eveningId).toBe(eve.id);
    expect(survey.status).toBe("active");
    expect(survey.activatedAt).toEqual(NOW);
    expect(survey.closedAt).toBeNull();
    expect(JSON.parse(survey.questions)).toHaveLength(STANDARD_QUESTIONS.length);
    // Die Frist kommt aus dem ABENDDATUM, nicht aus „jetzt". Bei einem vorab
    // geplanten Abend ist das der ganze Punkt: freigegeben wird um 19:30,
    // geschlossen wird nach dem Abend.
    expect(survey.closesAt).toEqual(computeClosesAt(ABEND, 48));
    expect(survey.closesAt!.getTime()).not.toBe(NOW.getTime() + 48 * 3600_000);
    // Der Abend gilt jetzt als gelaufen — und er hat die Umfrage dazu. Beides
    // in einer Transaktion, sonst wäre er von einem nachgetragenen Abend ohne
    // Erhebung nicht mehr zu unterscheiden.
    expect(getEvening(db, eve.id)!.status).toBe("held");
    expect(countActive(g.id)).toBe(1);
  });

  it("schließt die laufende Umfrage DERSELBEN Gruppe und lässt eine fremde in Ruhe", () => {
    // Der öffentliche Zugang hängt an der GRUPPE (`/f/{slug}-{secret}`): zwei
    // aktive Umfragen derselben Gruppe machen den gedruckten QR-Code
    // mehrdeutig. Über Gruppengrenzen hinweg gibt es diese Kopplung nicht.
    const a = mkGroup("A", "a");
    const b = mkGroup("B", "b");
    const laufendA = createAndStartSurvey(db, { groupId: a.id, date: tag("2026-09-29"), topic: null, notes: null, participants: null, closeAfterHours: 240, now: new Date("2026-09-29T19:00:00Z") });
    const laufendB = createAndStartSurvey(db, { groupId: b.id, date: tag("2026-09-30"), topic: null, notes: null, participants: null, closeAfterHours: 240, now: new Date("2026-09-30T19:00:00Z") });

    releaseSurveyForEvening(db, { eveningId: geplanterAbend(a.id).id, closeAfterHours: 48, now: NOW });

    const vorherA = getSurvey(db, laufendA.surveyId)!;
    expect(vorherA.status).toBe("closed");
    expect(vorherA.closedAt).toEqual(NOW);
    expect(countActive(a.id)).toBe(1);
    expect(getSurvey(db, laufendB.surveyId)!.status).toBe("active");
    expect(getSurvey(db, laufendB.surveyId)!.closedAt).toBeNull();
    expect(activeSurveyForGroup(db, b.id)!.survey.id).toBe(laufendB.surveyId);
  });

  it("aktiviert eine SCHON VORHANDENE Umfrage des Abends, statt eine zweite anzulegen", () => {
    // `idx_surveys_evening` ist UNIQUE — ein blindes `insert` wäre kein
    // Schönheitsfehler, sondern ein Laufzeitfehler mitten in der Freigabe. Der
    // Fall entsteht bei einem Altbestands-Entwurf an einem von Hand auf
    // `planned` gesetzten Abend.
    const g = mkGroup();
    const eve = geplanterAbend(g.id);
    const entwurf = insertSurvey(db, { eveningId: eve.id, questions: "[]", closeAfterHours: 24, createdAt: new Date(0) });

    const survey = releaseSurveyForEvening(db, {
      eveningId: eve.id,
      closeAfterHours: 24,
      now: NOW,
    });

    expect(survey.id).toBe(entwurf.id);
    expect(anzahlUmfragen(eve.id)).toBe(1);
    expect(survey.status).toBe("active");
    expect(survey.closesAt).toEqual(computeClosesAt(ABEND, 24));
    expect(getEvening(db, eve.id)!.status).toBe("held");
  });

  it("eine zweite Freigabe desselben Abends beendet ihn nicht", () => {
    // Doppelklick oder Neuladen: danach läuft die Umfrage weiter und trägt
    // keinen Schlusszeitstempel. Geprüft ist das ERGEBNIS — dass die
    // Geschwister-Schließung die eigene Umfrage ausnimmt (`ausser`), ist daran
    // nicht abzulesen, weil das anschließende Update denselben Zustand
    // schriebe; die Ausnahme spart den Umweg, sie ist hier nicht bewiesen.
    const g = mkGroup();
    const eve = geplanterAbend(g.id);
    releaseSurveyForEvening(db, { eveningId: eve.id, closeAfterHours: 48, now: NOW });

    const erneut = releaseSurveyForEvening(db, {
      eveningId: eve.id,
      closeAfterHours: 48,
      now: new Date("2026-10-06T19:45:00Z"),
    });

    expect(erneut.status).toBe("active");
    expect(erneut.closedAt).toBeNull();
    expect(countActive(g.id)).toBe(1);
  });
});

describe("setEveningStatus", () => {
  it("setzt genau den einen Abend", () => {
    // Ein Statussetzer, der breiter trifft als er soll, sagt eine ganze Serie
    // ab — und das fällt erst auf, wenn jemand den Verlauf durchsieht.
    const g = mkGroup();
    const a = insertEvening(db, { groupId: g.id, date: new Date("2026-10-06T00:00:00Z"), topic: null, notes: null, participantCount: null, status: "planned", createdAt: new Date(0) });
    const b = insertEvening(db, { groupId: g.id, date: new Date("2026-10-13T00:00:00Z"), topic: null, notes: null, participantCount: null, status: "planned", createdAt: new Date(0) });
    const fremd = mkGroup("B", "b");
    const c = insertEvening(db, { groupId: fremd.id, date: new Date("2026-10-06T00:00:00Z"), topic: null, notes: null, participantCount: null, status: "planned", createdAt: new Date(0) });

    setEveningStatus(db, a.id, "cancelled");

    expect(getEvening(db, a.id)!.status).toBe("cancelled");
    expect(getEvening(db, b.id)!.status).toBe("planned");
    expect(getEvening(db, c.id)!.status).toBe("planned");
  });

  it("setzt einen abgesagten Abend wieder auf `planned` zurück", () => {
    // Die Rücknahme muss genauso funktionieren wie das Absagen — sonst bliebe
    // eine versehentliche Absage stehen und der Termin müsste neu geplant
    // werden, samt neuer Zeile im Verlauf.
    const g = mkGroup();
    const e = insertEvening(db, { groupId: g.id, date: new Date("2026-10-06T00:00:00Z"), topic: null, notes: null, participantCount: null, status: "planned", createdAt: new Date(0) });
    setEveningStatus(db, e.id, "cancelled");
    setEveningStatus(db, e.id, "planned");
    expect(getEvening(db, e.id)!.status).toBe("planned");
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
    // Die Invariante zählt per SQL: `activeSurveyForGroup` nutzt `.get()` und
    // hätte bei ZWEI aktiven Zeilen stumm s2 geliefert (Fund aus Task 16).
    expect(countActive(g.id)).toBe(1);
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
    expect(countActive(groupB.id)).toBe(1);
    expect(activeSurveyForGroup(db, groupB.id)!.survey.id).toBe(sB.id);

    // Innerhalb Gruppe A greift weiterhin die max-1-aktiv-Regel — per COUNT(*),
    // nicht über `.get()`.
    expect(getSurvey(db, sA1.id)!.status).toBe("closed");
    expect(getSurvey(db, sA2.id)!.status).toBe("active");
    expect(countActive(groupA.id)).toBe(1);
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

/**
 * DIE JÜNGSTE UMFRAGE EINER GRUPPE — die Abfrage hinter dem öffentlichen
 * Zettel, wenn gerade nichts läuft (DRK-426).
 *
 * ⚠️ JEDER FALL HIER IST EINER, DER STILL DIE FALSCHE SEITE ZEIGT. Der Weg
 * hieß früher „der jüngste Abend, und dann dessen Umfrage"; seit es
 * vorausgeplante Abende gibt, ist der jüngste Abend einer planenden Gruppe
 * einer in der ZUKUNFT und trägt keine Umfrage. Wer eben acht Noten auf einen
 * gerade abgelaufenen Bogen abgeschickt hat, bekam dann „Zurzeit läuft keine
 * Umfrage" statt des Bogens, den er in der Hand hielt — kein Fehler, keine
 * Meldung, nur eine Auskunft über etwas anderes.
 *
 * Gefragt ist deshalb nicht „welchen Status hat der letzte Abend?", sondern
 * „wo wurde zuletzt erhoben?". Die Fälle unten sind die beiden Abendlagen, die
 * nie eine Umfrage tragen (geplant, abgesagt), plus die Gruppentrennung und der
 * Leerfall.
 */
describe("latestSurveyForGroup", () => {
  const tag = (iso: string) => new Date(`${iso}T00:00:00Z`);
  const abend = (groupId: number, iso: string, status: EveningStatus = "held") =>
    insertEvening(db, {
      groupId,
      date: tag(iso),
      topic: iso,
      notes: null,
      participantCount: null,
      status,
      createdAt: new Date(0),
    });
  const umfrage = (eveningId: number) =>
    insertSurvey(db, { eveningId, questions: "[]", closeAfterHours: null, createdAt: new Date(0) });

  it("liefert die Umfrage des jüngsten Abends, DER EINE HAT — ein geplanter Zukunftsabend gewinnt nicht", () => {
    // Der Kern des Fehlers, und er braucht beide Abende: ohne den geplanten
    // wäre die Zusicherung auch mit „jüngster Abend, dann seine Umfrage" grün.
    const g = mkGroup();
    const gelaufen = abend(g.id, "2026-10-06");
    const s = umfrage(gelaufen.id);
    abend(g.id, "2026-10-20", "planned");

    const treffer = latestSurveyForGroup(db, g.id);

    expect(treffer?.survey.id).toBe(s.id);
    // Und der Abend DAZU, nicht irgendeiner: der Zettel nennt Thema und Datum
    // des Abends, den die Person bewertet hat.
    expect(treffer?.evening.id).toBe(gelaufen.id);
  });

  it("übergeht ebenso einen ABGESAGTEN Abend mit späterem Datum", () => {
    // Dieselbe Lücke aus der anderen Richtung, und sie gab es schon vor der
    // Vorausplanung: ein abgesagter Abend trägt nie eine Umfrage. Wer nur den
    // geplanten Fall abdeckt, repariert die Hälfte.
    const g = mkGroup();
    const gelaufen = abend(g.id, "2026-10-06");
    const s = umfrage(gelaufen.id);
    abend(g.id, "2026-10-13", "cancelled");

    expect(latestSurveyForGroup(db, g.id)?.survey.id).toBe(s.id);
  });

  it("nimmt unter mehreren Umfragen die des jüngsten Abends", () => {
    // Die Abfrage soll nicht „irgendeine" liefern: ohne die Sortierung über
    // `evenings.date` käme die zuerst eingefügte Zeile zurück — hier der
    // ältere Abend, und der Zettel nennte ein Thema von vorletzter Woche.
    const g = mkGroup();
    const alt = umfrage(abend(g.id, "2026-09-29").id);
    const neu = umfrage(abend(g.id, "2026-10-06").id);

    expect(latestSurveyForGroup(db, g.id)?.survey.id).toBe(neu.id);
    expect(latestSurveyForGroup(db, g.id)?.survey.id).not.toBe(alt.id);
  });

  it("entscheidet bei ZWEI Abenden am selben Tag für die jüngere Umfrage", () => {
    // Der Gleichstand ist selten, aber herstellbar: `planEvenings` entdoppelt
    // nur den Planungsweg, „Feedback starten" prüft den Tag gar nicht. Ohne ein
    // zweites Sortierkriterium entschiede die Zeilenreihenfolge von SQLite,
    // welchen der beiden Bögen der Teilnehmer auf dem öffentlichen Zettel
    // sieht — stumm, und von Lauf zu Lauf verschieden.
    const g = mkGroup();
    const zuerst = umfrage(abend(g.id, "2026-10-06").id);
    const danach = umfrage(abend(g.id, "2026-10-06").id);

    expect(latestSurveyForGroup(db, g.id)?.survey.id).toBe(danach.id);
    expect(latestSurveyForGroup(db, g.id)?.survey.id).not.toBe(zuerst.id);
  });

  it("trennt die Gruppen — ein fremder Abend mit späterem Datum zählt nicht", () => {
    // Ohne den Gruppenfilter zeigte der öffentliche Zettel einer Bereitschaft
    // das Thema einer anderen. Der Link ist login-frei, also wäre das eine
    // Auskunft über eine fremde Gruppe an jeden, der scannt.
    const a = mkGroup("A", "a");
    const b = mkGroup("B", "b");
    const eigene = umfrage(abend(a.id, "2026-10-06").id);
    umfrage(abend(b.id, "2026-10-20").id);

    expect(latestSurveyForGroup(db, a.id)?.survey.id).toBe(eigene.id);
    expect(latestSurveyForGroup(db, a.id)?.evening.groupId).toBe(a.id);
  });

  it("liefert `undefined`, wenn die Gruppe NUR geplante Abende hat", () => {
    // Der ehrliche Leerfall — und genau der, den die Seite als „zurzeit läuft
    // keine Umfrage" anzeigen SOLL. Stünde hier `null` statt `undefined`,
    // liefe der Zweig in page.tsx auf der falschen Seite der Abfrage.
    const g = mkGroup();
    abend(g.id, "2026-10-06", "planned");
    abend(g.id, "2026-10-13", "planned");

    expect(latestSurveyForGroup(db, g.id)).toBeUndefined();
  });

  it("liefert `undefined` für eine Gruppe ganz ohne Abende", () => {
    expect(latestSurveyForGroup(db, mkGroup().id)).toBeUndefined();
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
