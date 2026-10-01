import { describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { testDb } from "../_lib/testDb";
import { bibVerbindung, briefkopf, plan, planFreigabe } from "./schema";

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
  it("Briefkopf: genau eine Zeile (id = 1), Logo nur vollständig und höchstens 1 MB", () => {
    const db = testDb();
    const basis = { id: 1, organisation: null, aktualisiertAm: new Date(0), aktualisiertVon: "Alice" };
    db.insert(briefkopf).values(basis).run();
    expect(() => db.insert(briefkopf).values({ ...basis, id: 2 }).run()).toThrow();
    expect(() => db.update(briefkopf).set({ logo: Buffer.from("x") }).where(eq(briefkopf.id, 1)).run()).toThrow(); // ohne Typ und SHA
    expect(() => db.update(briefkopf).set({ logo: Buffer.from("x"), logoMime: "image/gif", logoSha256: "a" }).where(eq(briefkopf.id, 1)).run()).toThrow();
    expect(() => db.update(briefkopf).set({ logo: Buffer.alloc(1024 * 1024 + 1), logoMime: "image/png", logoSha256: "a" }).where(eq(briefkopf.id, 1)).run()).toThrow();
    db.update(briefkopf).set({ logo: Buffer.from("x"), logoMime: "image/png", logoSha256: "a" }).where(eq(briefkopf.id, 1)).run();
    expect(db.select().from(briefkopf).get()?.logo?.toString()).toBe("x");
  });
  it("Briefkopf: Anlegen, Logo und Name je eine Audit-Zeile; ein No-op nicht", () => {
    const db = testDb();
    db.insert(briefkopf).values({ id: 1, organisation: "Muster", aktualisiertAm: new Date(0), aktualisiertVon: "Alice" }).run();
    db.update(briefkopf).set({ organisation: "Muster" }).where(eq(briefkopf.id, 1)).run();
    db.update(briefkopf).set({ logo: Buffer.from("x"), logoMime: "image/png", logoSha256: "a" }).where(eq(briefkopf.id, 1)).run();
    db.update(briefkopf).set({ logo: Buffer.from("y"), logoSha256: "b" }).where(eq(briefkopf.id, 1)).run();
    expect(outbox(db).filter((z) => z.object_type === "briefkopf").map((z) => z.action)).toEqual(["create", "update", "update"]);
  });
  it("Freigabe: Spalten aus Spec §8.2 vorhanden — Phase 5 braucht keine Migration (Entscheidung 1)", () => {
    const db = testDb();
    const spalten = (db.all(sql`PRAGMA table_info(plan_freigabe)`) as { name: string; notnull: number }[]).map((s) => [s.name, s.notnull]);
    expect(spalten).toEqual([
      ["id", 1], ["plan_id", 1], ["token", 1], ["notiz", 0], ["ablauf", 0], ["widerrufen_am", 0],
      ["erstellt_am", 1], ["erstellt_von", 1], ["zuletzt_abgerufen", 0], ["abrufe", 1],
    ]);
  });
});
