import { describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { testDb } from "../_lib/testDb";
import { einstellung, fahrzeug, schluesselpaar } from "./schema";

const version = (db: ReturnType<typeof testDb>) =>
  (db.all(sql`SELECT version FROM stammdatenstand WHERE id = 1`) as { version: number }[])[0].version;
const outbox = (db: ReturnType<typeof testDb>) =>
  (db.all(sql`SELECT count(*) AS n FROM audit_outbox`) as { n: number }[])[0].n;
const FZ = { id: "11-83-1", typ: "RTW", kennung: "11-83-1", ruf: "Rotkreuz Uelzen 11-83-1", standort: "Uelzen", aktiv: true };
const PAAR = { schluesselId: "0123456789abcdef", oeffentlich: "AAAA", privatVerschluesselt: "AAAA:AAAA", erzeugtAm: new Date(0) };

describe("Stammdatenversion", () => {
  it("startet bei 0 und steigt bei Anlegen, echter Änderung und Löschen", () => {
    const db = testDb();
    expect(version(db)).toBe(0);
    db.insert(fahrzeug).values(FZ).run();
    expect(version(db)).toBe(1);
    db.update(fahrzeug).set({ ruf: "Rotkreuz Uelzen 83/1" }).where(eq(fahrzeug.id, FZ.id)).run();
    expect(version(db)).toBe(2);
    db.delete(fahrzeug).where(eq(fahrzeug.id, FZ.id)).run();
    expect(version(db)).toBe(3);
  });
  it("ein Update ohne Änderung erhöht weder Version noch Audit-Log", () => {
    const db = testDb();
    db.insert(fahrzeug).values(FZ).run();
    const [v, n] = [version(db), outbox(db)];
    db.update(fahrzeug).set({ ruf: FZ.ruf }).where(eq(fahrzeug.id, FZ.id)).run();
    expect([version(db), outbox(db)]).toEqual([v, n]);
  });
  it("auch Einstellungen zählen", () => {
    const db = testDb();
    db.insert(einstellung).values({ schluessel: "fristMinuten", wert: "30" }).run();
    expect(version(db)).toBe(1);
  });
  it("Änderungen landen mit Tabellenname in der Audit-Outbox", () => {
    const db = testDb();
    db.insert(fahrzeug).values(FZ).run();
    const zeilen = db.all(sql`SELECT action, object_type FROM audit_outbox`) as { action: string; object_type: string }[];
    expect(zeilen).toContainEqual({ action: "create", object_type: "fahrzeug" });
  });
});

describe("schluesselpaar", () => {
  it("genau ein echtes Paar", () => {
    const db = testDb();
    db.insert(schluesselpaar).values({ id: "a", art: "echt", rechnerId: null, ...PAAR }).run();
    expect(() => db.insert(schluesselpaar).values({ id: "b", art: "echt", rechnerId: null, ...PAAR, schluesselId: "fedcba9876543210" }).run()).toThrow();
  });
  it("echt ⇔ ohne Rechner, test ⇔ mit Rechner; beliebig viele Testpaare", () => {
    const db = testDb();
    expect(() => db.insert(schluesselpaar).values({ id: "a", art: "echt", rechnerId: "r1", ...PAAR }).run()).toThrow();
    expect(() => db.insert(schluesselpaar).values({ id: "b", art: "test", rechnerId: null, ...PAAR }).run()).toThrow();
    db.insert(schluesselpaar).values({ id: "c", art: "test", rechnerId: "r1", ...PAAR }).run();
    db.insert(schluesselpaar).values({ id: "d", art: "test", rechnerId: "r2", ...PAAR, schluesselId: "1111111111111111" }).run();
  });
  it("die schluesselId ist eindeutig und 16 Zeichen Hex", () => {
    const db = testDb();
    db.insert(schluesselpaar).values({ id: "a", art: "test", rechnerId: "r1", ...PAAR }).run();
    expect(() => db.insert(schluesselpaar).values({ id: "b", art: "test", rechnerId: "r2", ...PAAR }).run()).toThrow();
    expect(() => db.insert(schluesselpaar).values({ id: "c", art: "test", rechnerId: "r3", ...PAAR, schluesselId: "XYZ" }).run()).toThrow();
  });
});
