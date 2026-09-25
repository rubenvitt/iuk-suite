import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { testDb } from "./testDb";
import { einstellung } from "../_db/schema";
import { EINSTELLUNG_VORGABEN, einstellungenSchema, leseEinstellungen, schreibeEinstellungen } from "./einstellungen";
import { stammdatenVersion } from "./stammdaten/daten";

describe("Einstellungen", () => {
  it("ohne Zeilen gelten die Vorgaben der Spec", () => {
    expect(leseEinstellungen(testDb())).toEqual({ fristMinuten: 15, besatzung: true, bereitschaft: "DRK-Bereitschaft Uelzen" });
  });
  it("schreibt, liest zurück, und unverändertes Speichern erhöht weder Version noch Audit-Log", () => {
    const db = testDb();
    schreibeEinstellungen(db, { fristMinuten: 30, besatzung: false, bereitschaft: "DRK-Bereitschaft Ebstorf" });
    expect(leseEinstellungen(db)).toEqual({ fristMinuten: 30, besatzung: false, bereitschaft: "DRK-Bereitschaft Ebstorf" });
    const v = stammdatenVersion(db);
    const n = (db.all(sql`SELECT count(*) AS n FROM audit_outbox`) as { n: number }[])[0].n;
    schreibeEinstellungen(db, leseEinstellungen(db));
    expect(stammdatenVersion(db)).toBe(v);
    expect((db.all(sql`SELECT count(*) AS n FROM audit_outbox`) as { n: number }[])[0].n).toBe(n);
  });
  it("ein unlesbarer gespeicherter Wert fällt auf die Vorgabe zurück", () => {
    const db = testDb();
    db.insert(einstellung).values({ schluessel: "fristMinuten", wert: '"viel"' }).run();
    expect(leseEinstellungen(db).fristMinuten).toBe(EINSTELLUNG_VORGABEN.fristMinuten);
  });
  it("Frist nur 1–120 ganze Minuten, Name nicht leer", () => {
    expect(einstellungenSchema.safeParse({ ...EINSTELLUNG_VORGABEN, fristMinuten: 0 }).success).toBe(false);
    expect(einstellungenSchema.safeParse({ ...EINSTELLUNG_VORGABEN, fristMinuten: 121 }).success).toBe(false);
    expect(einstellungenSchema.safeParse({ ...EINSTELLUNG_VORGABEN, fristMinuten: 1.5 }).success).toBe(false);
    expect(einstellungenSchema.safeParse({ ...EINSTELLUNG_VORGABEN, bereitschaft: "  " }).success).toBe(false);
  });
});
