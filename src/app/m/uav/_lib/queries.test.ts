import { describe, it, expect, beforeEach } from "vitest";
import { testDb, type TestDb } from "./testDb";
import * as q from "./queries";
import { eq } from "drizzle-orm";
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

/**
 * DRK-285: die Execution-ID ist global (Primärschlüssel), der Konfliktpfad des
 * UPSERT fand eine FREMDE Zeile allein über die ID und überschrieb sie — die
 * ID-Kenntnis (z. B. vom geteilten Tablet) war die ganze Schreibberechtigung.
 */
describe("sync — fremde Execution-IDs (DRK-285)", () => {
  let db: TestDb; let a: string; let b: string;
  const eigene = { id: "a-1", taskId: "1-1", datum: "2026-08-10", drohnensteuerer: "Ada", luftraumbeobachter: "Bea" };
  beforeEach(() => {
    db = testDb(); a = grund(db).id; b = q.teilnehmerAnlegen(db, "Bob", null).id;
    q.sync(db, a, { since: null, executions: [eigene], taskStatus: [] });
  });
  const zeileVonA = () => db.select().from(executions).where(eq(executions.id, "a-1")).get();

  it("B kann As bestehende ID weder ändern noch per deletedAt löschen — A bleibt bytegleich", () => {
    const vorher = zeileVonA();
    expect(() => q.sync(db, b, { since: null, executions: [{ ...eigene, datum: "2030-01-01", drohnensteuerer: "Mallory" }], taskStatus: [] }))
      .toThrow(q.FremdeDurchfuehrung);
    expect(() => q.sync(db, b, { since: null, executions: [{ ...eigene, deletedAt: "2026-09-01T00:00:00.000Z" }], taskStatus: [] }))
      .toThrow(q.FremdeDurchfuehrung);
    expect(zeileVonA()).toEqual(vorher);
    expect(q.fortschritt(db, b).executions).toEqual([]);
  });

  it("gemischter Batch: nichts wird angewendet, alle fremden IDs werden genannt", () => {
    let fehler: unknown;
    try {
      q.sync(db, b, {
        since: null,
        executions: [{ ...eigene, id: "b-neu" }, { ...eigene, deletedAt: "2026-09-01T00:00:00.000Z" }],
        taskStatus: [{ taskId: "1-1", zielanzahl: 7, nichtAnwendbar: false, updatedAt: "2026-09-01T00:00:00.000Z" }],
      });
    } catch (e) { fehler = e; }
    expect(fehler).toBeInstanceOf(q.FremdeDurchfuehrung);
    expect((fehler as InstanceType<typeof q.FremdeDurchfuehrung>).ids).toEqual(["a-1"]);
    // Alles-oder-nichts: auch Bs eigener neuer Eintrag und sein TaskStatus sind zurückgerollt.
    expect(q.fortschritt(db, b)).toMatchObject({ executions: [], taskStatus: [] });
    expect(zeileVonA()?.deletedAt).toBeNull();
  });

  it("eigene Updates, Tombstones, neue Einträge und ein konfliktfreier Retry funktionieren weiter", () => {
    q.sync(db, a, { since: null, executions: [{ ...eigene, luftraumbeobachter: "Cleo" }, { ...eigene, id: "a-2" }], taskStatus: [] });
    q.sync(db, a, { since: null, executions: [{ ...eigene, luftraumbeobachter: "Cleo" }, { ...eigene, id: "a-2" }], taskStatus: [] });
    q.sync(db, a, { since: null, executions: [{ ...eigene, id: "a-2", deletedAt: "2026-09-01T00:00:00.000Z" }], taskStatus: [] });
    const snap = q.fortschritt(db, a);
    expect(snap.executions.map((e) => [e.id, e.luftraumbeobachter, e.deletedAt ?? null])).toEqual([
      ["a-1", "Cleo", null], ["a-2", "Bea", "2026-09-01T00:00:00.000Z"],
    ]);
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
