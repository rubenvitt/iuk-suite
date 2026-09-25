import { describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { testDb } from "../_lib/testDb";
import { anker, ankerAbweichung, einmalcode, einstellung, fahrzeug, freigabe, rechner, schluesselpaar, sitzung } from "./schema";

const version = (db: ReturnType<typeof testDb>) =>
  (db.all(sql`SELECT version FROM stammdatenstand WHERE id = 1`) as { version: number }[])[0].version;
const outbox = (db: ReturnType<typeof testDb>) =>
  (db.all(sql`SELECT count(*) AS n FROM audit_outbox`) as { n: number }[])[0].n;
const FZ = { id: "11-83-1", typ: "RTW", kennung: "11-83-1", ruf: "Rotkreuz Uelzen 11-83-1", standort: "Uelzen", aktiv: true };
const PAAR = { schluesselId: "0123456789abcdef", oeffentlich: "AAAA", privatVerschluesselt: "AAAA:AAAA", erzeugtAm: new Date(0) };
// `tokenHash` folgt aus `id`, damit jeder Aufruf ohne Kollision einen weiteren Rechner anlegen kann.
const RECHNER = (id: string, art: "echt" | "test" = "echt") =>
  ({ id, art, name: "Leitstelle", tokenHash: `token-${id}`, eingerichtetAm: new Date(0), eingerichtetVon: "Alice", eingerichtetVonSub: "sub-1" });

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
    db.insert(rechner).values(RECHNER("r1", "test")).run();
    db.insert(rechner).values(RECHNER("r2", "test")).run();
    expect(() => db.insert(schluesselpaar).values({ id: "a", art: "echt", rechnerId: "r1", ...PAAR }).run()).toThrow();
    expect(() => db.insert(schluesselpaar).values({ id: "b", art: "test", rechnerId: null, ...PAAR }).run()).toThrow();
    db.insert(schluesselpaar).values({ id: "c", art: "test", rechnerId: "r1", ...PAAR }).run();
    db.insert(schluesselpaar).values({ id: "d", art: "test", rechnerId: "r2", ...PAAR, schluesselId: "1111111111111111" }).run();
  });
  it("die schluesselId ist eindeutig und 16 Zeichen Hex", () => {
    const db = testDb();
    db.insert(rechner).values(RECHNER("r1", "test")).run();
    db.insert(rechner).values(RECHNER("r2", "test")).run();
    db.insert(rechner).values(RECHNER("r3", "test")).run();
    db.insert(schluesselpaar).values({ id: "a", art: "test", rechnerId: "r1", ...PAAR }).run();
    expect(() => db.insert(schluesselpaar).values({ id: "b", art: "test", rechnerId: "r2", ...PAAR }).run()).toThrow();
    expect(() => db.insert(schluesselpaar).values({ id: "c", art: "test", rechnerId: "r3", ...PAAR, schluesselId: "XYZ" }).run()).toThrow();
  });
  it("ein Test-Paar ohne existierenden Rechner scheitert an der Konsistenzregel", () => {
    const db = testDb();
    expect(() => db.insert(schluesselpaar).values({ id: "a", art: "test", rechnerId: "unbekannt", ...PAAR }).run())
      .toThrow("schluesselpaar.rechner_id: kein Test-Rechner");
  });
  it("ein Test-Paar auf einen echten Rechner scheitert ebenso", () => {
    const db = testDb();
    db.insert(rechner).values(RECHNER("r1", "echt")).run();
    expect(() => db.insert(schluesselpaar).values({ id: "a", art: "test", rechnerId: "r1", ...PAAR }).run())
      .toThrow("schluesselpaar.rechner_id: kein Test-Rechner");
  });
});

describe("rechner", () => {
  it("ein zweiter aktiver echter Rechner scheitert am Teilindex rechner_echt_aktiv", () => {
    const db = testDb();
    db.insert(rechner).values(RECHNER("r1", "echt")).run();
    expect(() => db.insert(rechner).values(RECHNER("r2", "echt")).run()).toThrow();
  });
  it("mit widerrufen_am gesetzt am ersten gelingt ein zweiter echter Rechner", () => {
    const db = testDb();
    db.insert(rechner).values(RECHNER("r1", "echt")).run();
    db.update(rechner).set({ widerrufenAm: new Date(1) }).where(eq(rechner.id, "r1")).run();
    db.insert(rechner).values(RECHNER("r2", "echt")).run();
  });
  it("das Löschen eines Test-Rechners entfernt sein Paar, seine Anker, Abweichungen und Sitzungen; das echte Paar bleibt", () => {
    const db = testDb();
    db.insert(schluesselpaar).values({ id: "echt", art: "echt", rechnerId: null, ...PAAR }).run();
    db.insert(rechner).values(RECHNER("t1", "test")).run();
    db.insert(schluesselpaar).values({ id: "test1", art: "test", rechnerId: "t1", ...PAAR, schluesselId: "1111111111111111" }).run();
    db.insert(anker).values({ rechnerId: "t1", block: 1, hash: "a".repeat(64), gemeldetAm: new Date(0) }).run();
    db.insert(ankerAbweichung).values({ id: "abw1", rechnerId: "t1", block: 1, erwartet: "a".repeat(64), gemeldet: "b".repeat(64), zeitpunkt: new Date(0) }).run();
    db.insert(sitzung).values({ tokenHash: "sitz1", sub: "sub-1", name: "Alice", ablauf: new Date(0), rechnerId: "t1" }).run();

    db.delete(rechner).where(eq(rechner.id, "t1")).run();

    expect(db.select().from(schluesselpaar).where(eq(schluesselpaar.rechnerId, "t1")).all()).toEqual([]);
    expect(db.select().from(anker).all()).toEqual([]);
    expect(db.select().from(ankerAbweichung).all()).toEqual([]);
    expect(db.select().from(sitzung).all()).toEqual([]);
    expect(db.select().from(schluesselpaar).where(eq(schluesselpaar.id, "echt")).all()).toHaveLength(1);
  });
});

describe("Audit von Rechner, Anker-Abweichung und Freigabe", () => {
  it("audit_outbox bekommt Zeilen für rechner create/update/delete, anker_abweichung create und freigabe create", () => {
    const db = testDb();
    db.insert(rechner).values(RECHNER("r1", "echt")).run();
    db.update(rechner).set({ name: "Leitstelle 2" }).where(eq(rechner.id, "r1")).run();
    db.delete(rechner).where(eq(rechner.id, "r1")).run();
    db.insert(rechner).values(RECHNER("t1", "test")).run();
    db.insert(ankerAbweichung).values({ id: "abw1", rechnerId: "t1", block: 1, erwartet: "a".repeat(64), gemeldet: "b".repeat(64), zeitpunkt: new Date(0) }).run();
    db.insert(freigabe).values({ id: "f1", zeitpunkt: new Date(0), sub: "sub-1", name: "Alice", art: "test", rechnerId: "t1", rechnerName: "Testrechner", bloecke: "1-2", anzahl: 2 }).run();

    const zeilen = db.all(sql`SELECT action, object_type FROM audit_outbox`) as { action: string; object_type: string }[];
    expect(zeilen).toContainEqual({ action: "create", object_type: "rechner" });
    expect(zeilen).toContainEqual({ action: "update", object_type: "rechner" });
    expect(zeilen).toContainEqual({ action: "delete", object_type: "rechner" });
    expect(zeilen).toContainEqual({ action: "create", object_type: "anker_abweichung" });
    expect(zeilen).toContainEqual({ action: "create", object_type: "freigabe" });
  });
  it("ein UPDATE, das nur letzter_kontakt oder letzte_sicherung ändert, erzeugt keine Audit-Zeile", () => {
    const db = testDb();
    db.insert(rechner).values(RECHNER("r1", "echt")).run();
    const vorher = outbox(db);
    db.update(rechner).set({ letzterKontakt: new Date(5) }).where(eq(rechner.id, "r1")).run();
    db.update(rechner).set({ letzteSicherung: "2026-09-25T10:00:00+02:00" }).where(eq(rechner.id, "r1")).run();
    expect(outbox(db)).toBe(vorher);
  });
  it("anker, einmalcode und sitzung erzeugen keine Audit-Zeilen", () => {
    const db = testDb();
    db.insert(rechner).values(RECHNER("t1", "test")).run();
    const vorher = outbox(db);
    db.insert(anker).values({ rechnerId: "t1", block: 1, hash: "a".repeat(64), gemeldetAm: new Date(0) }).run();
    db.insert(einmalcode).values({ codeHash: "c1", challenge: "chal", sub: "sub-1", name: "Alice", ablauf: new Date(0) }).run();
    db.insert(sitzung).values({ tokenHash: "s1", sub: "sub-1", name: "Alice", ablauf: new Date(0) }).run();
    expect(outbox(db)).toBe(vorher);
  });
});
