import { readFileSync, mkdirSync, rmSync } from "node:fs";
import { describe, it, expect, afterEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import * as schema from "@/app/m/uav/_db/schema";
import {
  lieseQuelle,
  bildUmschreiben,
  bildDateiname,
  importUav,
  paritaetUav,
  schreibeUndPruefe,
  type AltTeilnehmer,
  type AltAufgabe,
  type AltDurchfuehrung,
  type AltAufgabenStatus,
  type AltSitzung,
} from "./uav";

const DIR = "./.data/uav-import-test";

// Quelle: In-Memory-DB mit dem Alt-Schema — WÖRTLICH aus uav-praxis/server/db/schema.sql
// (nach scripts/import/fixtures/uav-alt-schema.sql kopiert).
function altDb(): Database.Database {
  const db = new Database(":memory:");
  db.exec(readFileSync("scripts/import/fixtures/uav-alt-schema.sql", "utf8"));
  return db;
}

function teilnehmer(db: Database.Database, over: Partial<AltTeilnehmer> = {}): AltTeilnehmer {
  const row: AltTeilnehmer = {
    id: "p-1",
    name: "Anna Nova",
    login_code: "ABCDEFGH",
    aktiv: 1,
    beginn: "2026-01-01",
    created_at: "2026-01-01T00:00:00.000Z",
    last_seen: null,
    ...over,
  };
  db.prepare(
    `INSERT INTO participants (id, name, login_code, aktiv, beginn, created_at, last_seen)
     VALUES (@id, @name, @login_code, @aktiv, @beginn, @created_at, @last_seen)`,
  ).run(row);
  return row;
}

function aufgabe(db: Database.Database, over: Partial<AltAufgabe> = {}): AltAufgabe {
  const row: AltAufgabe = {
    id: "1-1",
    teil: 1,
    nummer: "1.1",
    titel: "Sichtprüfung",
    lernziel: "Vorflugcheck",
    schritte: '["a","b"]',
    durchfuehrungshinweise: "[]",
    sicherheitshinweise: "[]",
    zielanzahl_default: 1,
    sort_order: 0,
    aktiv: 1,
    bild: "/illustrations/1-1.webp",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...over,
  };
  db.prepare(
    `INSERT INTO tasks (id, teil, nummer, titel, lernziel, schritte, durchfuehrungshinweise,
       sicherheitshinweise, zielanzahl_default, sort_order, aktiv, bild, updated_at)
     VALUES (@id, @teil, @nummer, @titel, @lernziel, @schritte, @durchfuehrungshinweise,
       @sicherheitshinweise, @zielanzahl_default, @sort_order, @aktiv, @bild, @updated_at)`,
  ).run(row);
  return row;
}

function durchfuehrung(db: Database.Database, over: Partial<AltDurchfuehrung> = {}): AltDurchfuehrung {
  const row: AltDurchfuehrung = {
    id: "e-1",
    participant_id: "p-1",
    task_id: "1-1",
    datum: "2026-01-02",
    drohnensteuerer: "Anna Nova",
    luftraumbeobachter: "Bert Falk",
    created_at: "2026-01-02T00:00:00.000Z",
    deleted_at: null,
    ...over,
  };
  db.prepare(
    `INSERT INTO executions (id, participant_id, task_id, datum, drohnensteuerer,
       luftraumbeobachter, created_at, deleted_at)
     VALUES (@id, @participant_id, @task_id, @datum, @drohnensteuerer,
       @luftraumbeobachter, @created_at, @deleted_at)`,
  ).run(row);
  return row;
}

function aufgabenStatus(db: Database.Database, over: Partial<AltAufgabenStatus> = {}): AltAufgabenStatus {
  const row: AltAufgabenStatus = {
    participant_id: "p-1",
    task_id: "1-1",
    zielanzahl: 2,
    nicht_anwendbar: 0,
    updated_at: "2026-01-02T00:00:00.000Z",
    ...over,
  };
  db.prepare(
    `INSERT INTO task_status (participant_id, task_id, zielanzahl, nicht_anwendbar, updated_at)
     VALUES (@participant_id, @task_id, @zielanzahl, @nicht_anwendbar, @updated_at)`,
  ).run(row);
  return row;
}

function sitzung(db: Database.Database, over: Partial<AltSitzung> = {}): AltSitzung {
  const row: AltSitzung = {
    token: "tok-1",
    kind: "participant",
    subject_id: "p-1",
    created_at: "2026-01-01T00:00:00.000Z",
    expires_at: "2099-01-01T00:00:00.000Z",
    ...over,
  };
  db.prepare(
    `INSERT INTO sessions (token, kind, subject_id, created_at, expires_at)
     VALUES (@token, @kind, @subject_id, @created_at, @expires_at)`,
  ).run(row);
  return row;
}

/**
 * Direkt gebaute, migrierte DB — NICHT getModuleDb(): dessen globaler Cache ist per
 * Modulschlüssel gekeyt, nicht per DATA_DIR, und gäbe zwischen Tests ein stale Handle
 * auf die alte Datei zurück (radio.test.ts:41-49 begründet es ausführlich).
 */
function frischeZielDb(): ReturnType<typeof drizzle<typeof schema>> {
  rmSync(DIR, { recursive: true, force: true });
  mkdirSync(DIR, { recursive: true });
  const sqlite = new Database(`${DIR}/uav.db`);
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./src/app/m/uav/_db/migrations" });
  return db;
}
afterEach(() => rmSync(DIR, { recursive: true, force: true }));

const JETZT = new Date("2026-06-01T00:00:00.000Z");

describe("bildUmschreiben", () => {
  it("schreibt nur den /illustrations/-Präfix um", () => {
    expect(bildUmschreiben("/illustrations/1-1.webp")).toBe("/m/uav/illustrations/1-1.webp");
    expect(bildUmschreiben("/anderswo/1-1.webp")).toBe("/anderswo/1-1.webp");
    expect(bildUmschreiben(null)).toBeNull();
  });
});

describe("bildDateiname", () => {
  it("reduziert einen Pfad auf den Dateinamen", () => {
    expect(bildDateiname("/m/uav/illustrations/1-1.webp")).toBe("1-1.webp");
    expect(bildDateiname("/illustrations/1-1.webp")).toBe("1-1.webp");
    expect(bildDateiname(null)).toBeNull();
  });
});

describe("lieseQuelle", () => {
  it("liest alle fünf Tabellen", () => {
    const quelle = altDb();
    teilnehmer(quelle);
    aufgabe(quelle);
    durchfuehrung(quelle);
    aufgabenStatus(quelle);
    sitzung(quelle);
    const q = lieseQuelle(quelle);
    expect(q.participants).toHaveLength(1);
    expect(q.tasks).toHaveLength(1);
    expect(q.executions).toHaveLength(1);
    expect(q.taskStatus).toHaveLength(1);
    expect(q.sessions).toHaveLength(1);
    quelle.close();
  });
});

describe("importUav", () => {
  it("kopiert alle fünf Tabellen ID-erhaltend, Paritätscheck grün", () => {
    const quelle = altDb();
    teilnehmer(quelle);
    aufgabe(quelle);
    durchfuehrung(quelle);
    aufgabenStatus(quelle);
    sitzung(quelle);

    const ziel = frischeZielDb();
    const ergebnis = importUav(quelle, ziel, JETZT);
    expect(ergebnis).toEqual({
      participants: 1,
      tasks: 1,
      executions: 1,
      taskStatus: 1,
      sessions: 1,
      sessionsUebersprungen: 0,
    });

    const zielTeilnehmer = ziel.select().from(schema.participants).all();
    expect(zielTeilnehmer).toHaveLength(1);
    expect(zielTeilnehmer[0].id).toBe("p-1");

    const reports = paritaetUav(quelle, ziel, JETZT);
    expect(reports.every((r) => r.ok)).toBe(true);
    quelle.close();
  });

  it("ist idempotent — und ein zweiter Lauf nach einer Änderung in der Quelle ÄNDERT die Zielzeile", () => {
    const quelle = altDb();
    teilnehmer(quelle);
    aufgabe(quelle);
    const ziel = frischeZielDb();

    importUav(quelle, ziel, JETZT);
    quelle.prepare("UPDATE participants SET name = ? WHERE id = ?").run("Anna Nova (verheiratet)", "p-1");
    importUav(quelle, ziel, JETZT);

    const rows = ziel.select().from(schema.participants).all();
    expect(rows).toHaveLength(1); // kein Duplikat
    expect(rows[0].name).toBe("Anna Nova (verheiratet)"); // onConflictDoNothing würde das verfehlen
  });

  it("überspringt abgelaufene und admin-Sessions, zählt sie", () => {
    const quelle = altDb();
    teilnehmer(quelle);
    teilnehmer(quelle, { id: "p-2", login_code: "ZZZZZZZZ" });
    sitzung(quelle, { token: "gueltig", expires_at: "2099-01-01T00:00:00.000Z" });
    sitzung(quelle, { token: "abgelaufen", expires_at: "2020-01-01T00:00:00.000Z" });
    sitzung(quelle, { token: "admin", kind: "admin", subject_id: "p-2", expires_at: "2099-01-01T00:00:00.000Z" });

    const ziel = frischeZielDb();
    const ergebnis = importUav(quelle, ziel, JETZT);
    expect(ergebnis.sessions).toBe(1);
    expect(ergebnis.sessionsUebersprungen).toBe(2);

    const zielSessions = ziel.select().from(schema.sessions).all();
    expect(zielSessions.map((s) => s.token)).toEqual(["gueltig"]);
  });

  it("schreibt das Bildpräfix um; die Parität vergleicht Dateinamen", () => {
    const quelle = altDb();
    aufgabe(quelle, { bild: "/illustrations/1-1.webp" });
    const ziel = frischeZielDb();
    importUav(quelle, ziel, JETZT);

    const zielAufgaben = ziel.select().from(schema.tasks).all();
    expect(zielAufgaben[0].bild).toBe("/m/uav/illustrations/1-1.webp");

    const reports = paritaetUav(quelle, ziel, JETZT);
    expect(reports.every((r) => r.ok)).toBe(true);
  });
});

describe("paritaetUav", () => {
  it("Parität schlägt an, wenn im Ziel ein login_code fehlt", () => {
    const quelle = altDb();
    teilnehmer(quelle);
    const ziel = frischeZielDb();
    importUav(quelle, ziel, JETZT);

    // Login-Code im Ziel manuell verfälschen — der Fall, den die Zusatzprüfung
    // unabhängig von der Zeilenparität abfängt.
    ziel.update(schema.participants).set({ loginCode: "GEAENDERT" }).where(eq(schema.participants.id, "p-1")).run();

    expect(() => paritaetUav(quelle, ziel, JETZT)).toThrow(/login_code/);
  });

  it("bricht ab (assertParity wirft), bevor es 'fertig' meldet — und die Zielzeilen stehen bereits", () => {
    const quelle = altDb();
    teilnehmer(quelle);
    const ziel = frischeZielDb();

    // Eine Fremdzeile, die es in der Quelle nicht gibt: der Importer schreibt nur
    // additiv/upsert, löscht also nichts — die Parität muss deshalb ROT werden
    // (missingInSource), BEVOR irgendeine Erfolgsmeldung entstehen kann.
    ziel.insert(schema.participants).values({
      id: "fremd", name: "Fremdzeile", loginCode: "FREMDCOD", aktiv: 1,
      beginn: null, createdAt: "2020-01-01T00:00:00.000Z", lastSeen: null,
    }).run();

    expect(() => schreibeUndPruefe(quelle, ziel, JETZT)).toThrow(/Parity check FAILED/);

    // Der Import selbst ist bereits gelaufen — "abgebrochen" heißt hier: die
    // Erfolgsmeldung fehlt, nicht dass am Ziel nichts passiert wäre.
    const zielTeilnehmer = ziel.select().from(schema.participants).all();
    expect(zielTeilnehmer.map((p) => p.id).sort()).toEqual(["fremd", "p-1"]);
  });
});
