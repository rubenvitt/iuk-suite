import { describe, it, expect, beforeEach } from "vitest";
import { testDb, type TestDb } from "./testDb";
import * as q from "./queries";
import { executions, taskStatus } from "../_db/schema";

function grund(db: TestDb) {
  const p = q.teilnehmerAnlegen(db, "Ada", "2026-08-01");
  q.taskAnlegen(db, { id: "1-1", teil: 1, nummer: "1.1", titel: "Start", lernziel: "", schritte: [], durchfuehrungshinweise: [], sicherheitshinweise: [], zielanzahlDefault: 2, aktiv: true });
  q.taskAnlegen(db, { id: "1-2", teil: 1, nummer: "1.2", titel: "Landung", lernziel: "", schritte: [], durchfuehrungshinweise: [], sicherheitshinweise: [], zielanzahlDefault: 1, aktiv: true });
  return p;
}

describe("sync", () => {
  let db: TestDb; let pid: string;
  beforeEach(() => { db = testDb(); pid = grund(db).id; });

  it("ist idempotent per Client-UUID — und ein zweiter Lauf mit geänderten Feldern ÄNDERT die Zeile", () => {
    const e = { id: "e1", taskId: "1-1", datum: "2026-08-10", drohnensteuerer: "A", luftraumbeobachter: "B" };
    q.sync(db, pid, { since: null, executions: [e], taskStatus: [] });
    q.sync(db, pid, { since: null, executions: [{ ...e, luftraumbeobachter: "C" }], taskStatus: [] });
    const zeilen = db.select().from(executions).all();
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0].luftraumbeobachter).toBe("C");   // onConflictDoNothing wäre hier rot
  });
  it("Tombstone: deletedAt wird übernommen und fällt aus dem Fortschritt", () => {
    q.sync(db, pid, { since: null, executions: [{ id: "e1", taskId: "1-1", datum: "2026-08-10", drohnensteuerer: "", luftraumbeobachter: "" }], taskStatus: [] });
    q.sync(db, pid, { since: null, executions: [{ id: "e1", taskId: "1-1", datum: "2026-08-10", drohnensteuerer: "", luftraumbeobachter: "", deletedAt: "2026-08-11T00:00:00.000Z" }], taskStatus: [] });
    expect(db.select().from(executions).all()[0].deletedAt).toBe("2026-08-11T00:00:00.000Z");
    expect(q.teilnehmerDetail(db, pid).aufgaben.find((a) => a.taskId === "1-1")?.anzahl).toBe(0);
  });
  it("TaskStatus ist last-write-wins über updatedAt — ein älterer Stand überschreibt nicht", () => {
    q.sync(db, pid, { since: null, executions: [], taskStatus: [{ taskId: "1-1", zielanzahl: 5, nichtAnwendbar: false, updatedAt: "2026-08-10T10:00:00.000Z" }] });
    q.sync(db, pid, { since: null, executions: [], taskStatus: [{ taskId: "1-1", zielanzahl: 3, nichtAnwendbar: false, updatedAt: "2026-08-09T10:00:00.000Z" }] });
    expect(db.select().from(taskStatus).all()[0].zielanzahl).toBe(5);
  });
  it("participantId kommt aus dem Aufruf, nie aus dem Body — fremde Executions landen beim Aufrufer", () => {
    const fremd = q.teilnehmerAnlegen(db, "Bob", null);
    q.sync(db, pid, { since: null, executions: [{ id: "e9", taskId: "1-1", datum: "2026-08-10", drohnensteuerer: "", luftraumbeobachter: "" }], taskStatus: [] });
    expect(db.select().from(executions).all()[0].participantId).toBe(pid);
    expect(q.fortschritt(db, fremd.id).executions).toHaveLength(0);
  });
  it("liefert den vollen Snapshot mit serverTime", () => {
    const s = q.sync(db, pid, { since: null, executions: [], taskStatus: [] });
    expect(s).toEqual({ executions: [], taskStatus: [], serverTime: expect.any(String) });
  });
});

describe("Fortschritt und Auswertung", () => {
  it("erledigt = anzahl >= ziel, nichtAnwendbar zählt nicht; Quote über anwendbare", () => {
    const db = testDb(); const pid = grund(db).id;
    q.sync(db, pid, { since: null,
      executions: [{ id: "a", taskId: "1-1", datum: "2026-08-10", drohnensteuerer: "", luftraumbeobachter: "" },
                   { id: "b", taskId: "1-1", datum: "2026-08-11", drohnensteuerer: "", luftraumbeobachter: "" }],
      taskStatus: [{ taskId: "1-2", zielanzahl: null, nichtAnwendbar: true, updatedAt: "2026-08-10T00:00:00.000Z" }] });
    const d = q.teilnehmerDetail(db, pid);
    expect(d.erledigt).toBe(1); expect(d.gesamt).toBe(1); expect(d.quote).toBe(1);
    expect(d.aufgaben.find((a) => a.taskId === "1-1")?.letzteDurchfuehrung).toBe("2026-08-11");
    expect(d.teile).toEqual([{ teil: 1, erledigt: 1, gesamt: 1, quote: 1 }]);
    expect(q.teilnehmerUebersicht(db)[0]).toMatchObject({ erledigt: 1, gesamt: 1 });
  });
  it("Zielanzahl-Override, mindestens 1", () => {
    const db = testDb(); const pid = grund(db).id;
    q.sync(db, pid, { since: null, executions: [], taskStatus: [{ taskId: "1-1", zielanzahl: 0, nichtAnwendbar: false, updatedAt: "2026-08-10T00:00:00.000Z" }] });
    expect(q.teilnehmerDetail(db, pid).aufgaben[0].ziel).toBe(1);
  });
});

describe("Teilnehmer", () => {
  it("anlegen erzeugt einen eindeutigen 8er-Code; codeNeu rotiert ihn; perCode findet nur aktive", () => {
    const db = testDb();
    const a = q.teilnehmerAnlegen(db, "Ada", null);
    expect(a.loginCode).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
    expect(q.teilnehmerPerCode(db, a.loginCode)?.id).toBe(a.id);
    const b = q.teilnehmerAendern(db, a.id, { codeNeu: true });
    expect(b.loginCode).not.toBe(a.loginCode);
    q.teilnehmerAendern(db, a.id, { aktiv: false });
    expect(q.teilnehmerPerCode(db, b.loginCode)).toBeNull();
  });
  it("löschen kaskadiert auf executions und task_status", () => {
    const db = testDb(); const pid = grund(db).id;
    q.sync(db, pid, { since: null, executions: [{ id: "e", taskId: "1-1", datum: "2026-08-10", drohnensteuerer: "", luftraumbeobachter: "" }], taskStatus: [{ taskId: "1-1", zielanzahl: 1, nichtAnwendbar: false, updatedAt: "x" }] });
    q.teilnehmerLoeschen(db, pid);
    expect(db.select().from(executions).all()).toHaveLength(0);
    expect(db.select().from(taskStatus).all()).toHaveLength(0);
    expect(() => q.teilnehmerLoeschen(db, pid)).toThrow(q.NotFound);
  });
});

describe("Katalog", () => {
  it("reorder setzt sort_order nach Position; alleTasks(false) filtert inaktive; JSON-Spalten sind Arrays", () => {
    const db = testDb(); grund(db);
    q.tasksNeuSortieren(db, ["1-2", "1-1"]);
    expect(q.alleTasks(db).map((t) => t.id)).toEqual(["1-2", "1-1"]);
    q.taskAendern(db, "1-2", { aktiv: false, schritte: ["a", "b"] });
    expect(q.alleTasks(db).map((t) => t.id)).toEqual(["1-1"]);
    expect(q.alleTasks(db, true).find((t) => t.id === "1-2")?.schritte).toEqual(["a", "b"]);
  });
});
