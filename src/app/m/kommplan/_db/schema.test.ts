import { describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { testDb } from "../_lib/testDb";
import { bibVerbindung, plan, planFreigabe } from "./schema";

const PLAN = {
  id: "p1", titel: "Plan", typ: "kommunikationsplan" as const, anlass: null, datum: null,
  aktualisiertAm: new Date(0), aktualisiertVon: "Alice", inhalt: '{"schema":1}',
};
const outbox = (db: ReturnType<typeof testDb>) =>
  db.all(sql`SELECT action, object_type FROM audit_outbox ORDER BY rowid`) as { action: string; object_type: string }[];

describe("kommplan-Datenbank", () => {
  it("Plan mit Vorgaben: Version 1, keine Vorlage, nicht archiviert", () => {
    const db = testDb();
    db.insert(plan).values(PLAN).run();
    expect(db.select().from(plan).get()).toMatchObject({ version: 1, istVorlage: false, archiviertAm: null });
  });
  it("inhalt muss gültiges JSON sein, typ eine der zwei Arten", () => {
    const db = testDb();
    expect(() => db.insert(plan).values({ ...PLAN, inhalt: "{kaputt" }).run()).toThrow();
    expect(() => db.insert(plan).values({ ...PLAN, id: "p2", typ: "skizze" as never }).run()).toThrow();
  });
  it("Anlegen und echte Änderung landen im Audit, ein No-op-Update nicht", () => {
    const db = testDb();
    db.insert(plan).values(PLAN).run();
    db.update(plan).set({ titel: "Plan" }).where(eq(plan.id, "p1")).run();
    db.update(plan).set({ titel: "Neu", version: 2 }).where(eq(plan.id, "p1")).run();
    expect(outbox(db)).toEqual([{ action: "create", object_type: "plan" }, { action: "update", object_type: "plan" }]);
  });
  it("Freigabe: Token eindeutig, Plan muss existieren, Abrufzähler sind nicht auditiert", () => {
    const db = testDb();
    db.insert(plan).values(PLAN).run();
    const f = { id: "f1", planId: "p1", token: "abc", erstelltAm: new Date(0), erstelltVon: "Alice" };
    db.insert(planFreigabe).values(f).run();
    expect(() => db.insert(planFreigabe).values({ ...f, id: "f2" }).run()).toThrow();
    expect(() => db.insert(planFreigabe).values({ ...f, id: "f3", token: "xyz", planId: "fehlt" }).run()).toThrow();
    const vorher = outbox(db).length;
    db.update(planFreigabe).set({ abrufe: 1, zuletztAbgerufen: new Date(1) }).where(eq(planFreigabe.id, "f1")).run();
    expect(outbox(db).length).toBe(vorher);
    db.update(planFreigabe).set({ widerrufenAm: new Date(2) }).where(eq(planFreigabe.id, "f1")).run();
    expect(outbox(db).at(-1)).toEqual({ action: "update", object_type: "plan_freigabe" });
  });
  it("Bibliothek: Verbindungsart geprüft", () => {
    const db = testDb();
    db.insert(bibVerbindung).values({ id: "v", art: "tmo", bezeichnung: "R_UE_1" }).run();
    expect(() => db.insert(bibVerbindung).values({ id: "w", art: "brieftaube" as never, bezeichnung: "x" }).run()).toThrow();
  });
});
