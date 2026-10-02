import { describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { withAuditContext } from "@/core/audit/context";
import { plan } from "../_db/schema";
import { leererPlan, fuegeWurzelEin } from "./plan/operationen";
import { BEARBEITUNGSFENSTER_MS, ladeStand, legePlanAn, speichereAngaben, speichereInhalt } from "./speichern";
import { TEST_ADMIN, testDb, type TestDb } from "./testDb";

const JANA = { nutzer: "u-jana", name: "Jana Beispiel" };
const OLE = { nutzer: "u-ole", name: "Ole Beispiel" };
const T0 = Date.UTC(2026, 8, 30, 8, 0);
const ANGABEN = { titel: "Übung", typ: "kommunikationsplan", anlass: "Probe", datum: "2026-09-30" };

/** Audit-Zeilen der Tabellen plan und plan_bearbeitung, in Schreibreihenfolge. */
function audit(db: TestDb): string[] {
  return (db.all(sql`SELECT action, object_type, json_extract(actor, '$.id') AS wer FROM audit_outbox
    WHERE object_type IN ('plan', 'plan_bearbeitung') ORDER BY rowid`) as { action: string; object_type: string; wer: string | null }[])
    .map((r) => `${r.action} ${r.object_type}${r.wer ? ` ${r.wer}` : ""}`);
}
const als = <T,>(wer: typeof JANA, f: () => T) => withAuditContext({ actor: { kind: "user", id: wer.nutzer, name: wer.name } }, f);

function angelegt(db: TestDb): string {
  const r = als(JANA, () => legePlanAn(db, ANGABEN, JANA, T0, TEST_ADMIN));
  if (!r.ok) throw new Error(r.fehler);
  return r.id;
}

describe("Plan anlegen", () => {
  it("legt einen leeren Plan mit Version 1 an, geprüft und mit Audit-Zeile", () => {
    const db = testDb();
    const id = angelegt(db);
    const z = db.select().from(plan).where(eq(plan.id, id)).get()!;
    expect(z).toMatchObject({ titel: "Übung", typ: "kommunikationsplan", anlass: "Probe", version: 1, aktualisiertVon: "Jana Beispiel" });
    expect(z.datum?.getTime()).toBe(Date.UTC(2026, 8, 30));
    expect(JSON.parse(z.inhalt)).toEqual(leererPlan());
    expect(audit(db)).toEqual(["create plan u-jana"]);
  });
  it("meldet Feldfehler statt zu werfen", () => {
    const r = legePlanAn(testDb(), { ...ANGABEN, titel: "   " }, JANA, T0, TEST_ADMIN);
    expect(r).toEqual({ ok: false, fehler: "Bitte die markierten Felder prüfen.", feldFehler: { titel: "Bitte einen Titel eintragen." } });
  });
  it("ohne vorlage und mit vorlage: null wie bisher — ein leerer Plan (Phase 4, Entscheidung 8)", () => {
    const db = testDb();
    for (const eingabe of [ANGABEN, { ...ANGABEN, vorlage: null }]) {
      const r = legePlanAn(db, eingabe, JANA, T0, TEST_ADMIN);
      if (!r.ok) throw new Error(r.fehler);
      expect(JSON.parse(db.select().from(plan).where(eq(plan.id, r.id)).get()!.inhalt)).toEqual(leererPlan());
    }
  });
  it("vorlage kein String: Feldfehler an „vorlage“", () => {
    expect(legePlanAn(testDb(), { ...ANGABEN, vorlage: 42 }, JANA, T0, TEST_ADMIN))
      .toEqual({ ok: false, fehler: "Bitte die markierten Felder prüfen.", feldFehler: { vorlage: "Diese Vorlage gibt es nicht mehr." } });
  });
});

describe("Inhalt speichern mit Versionsprüfung", () => {
  it("zählt die Version hoch und setzt Stand und Bearbeiter", () => {
    const db = testDb();
    const id = angelegt(db);
    const r = als(OLE, () => speichereInhalt(db, { id, version: 1, inhalt: fuegeWurzelEin(leererPlan(), "w") }, OLE, T0 + 1000));
    expect(r).toEqual({ ok: true, version: 2, aktualisiertAm: T0 + 1000 });
    expect(db.select().from(plan).where(eq(plan.id, id)).get()).toMatchObject({ version: 2, aktualisiertVon: "Ole Beispiel" });
  });
  it("veraltete Version → Konflikt mit dem Serverstand; nichts geschrieben", () => {
    const db = testDb();
    const id = angelegt(db);
    als(JANA, () => speichereInhalt(db, { id, version: 1, inhalt: fuegeWurzelEin(leererPlan(), "w") }, JANA, T0 + 1));
    const r = als(OLE, () => speichereInhalt(db, { id, version: 1, inhalt: leererPlan() }, OLE, T0 + 2));
    expect(r).toMatchObject({ ok: false, grund: "konflikt", stand: { version: 2, aktualisiertVon: "Jana Beispiel", angaben: { titel: "Übung", datum: "2026-09-30" } } });
    expect(r.ok ? null : r.grund === "konflikt" ? r.stand.inhalt?.stellen.map((s) => s.id) : null).toEqual(["w"]);
  });
  it("ladeStand liest Version, Inhalt und Angaben; unbekannt oder archiviert ist null (Entscheidung 21)", () => {
    const db = testDb();
    const id = angelegt(db);
    als(JANA, () => speichereInhalt(db, { id, version: 1, inhalt: fuegeWurzelEin(leererPlan(), "w") }, JANA, T0 + 1));
    expect(ladeStand(db, id)).toMatchObject({ version: 2, aktualisiertVon: "Jana Beispiel", angaben: { titel: "Übung" } });
    expect(ladeStand(db, "gibt-es-nicht")).toBeNull();
    db.update(plan).set({ archiviertAm: new Date(T0) }).where(eq(plan.id, id)).run();
    expect(ladeStand(db, id)).toBeNull();
  });
  it("ungültiger Inhalt und unbekannter oder archivierter Plan", () => {
    const db = testDb();
    const id = angelegt(db);
    expect(speichereInhalt(db, { id, version: 1, inhalt: { schema: 1 } }, JANA, T0)).toMatchObject({ ok: false, grund: "ungueltig" });
    expect(speichereInhalt(db, { id: "gibt-es-nicht", version: 1, inhalt: leererPlan() }, JANA, T0)).toEqual({ ok: false, grund: "weg" });
    db.update(plan).set({ archiviertAm: new Date(T0) }).where(eq(plan.id, id)).run();
    expect(speichereInhalt(db, { id, version: 1, inhalt: leererPlan() }, JANA, T0)).toEqual({ ok: false, grund: "weg" });
  });
});

describe("Audit gebündelt (Entscheidung 1)", () => {
  it("dieselbe Person binnen 15 Minuten: eine Zeile; danach eine neue", () => {
    const db = testDb();
    const id = angelegt(db);
    let v = 1;
    const speichere = (wer: typeof JANA, zeit: number, n: number) => {
      const r = als(wer, () => speichereInhalt(db, { id, version: v, inhalt: fuegeWurzelEin(leererPlan(), `w${n}`) }, wer, zeit));
      if (!r.ok) throw new Error(JSON.stringify(r));
      v = r.version;
    };
    speichere(JANA, T0 + 1_000, 1);
    speichere(JANA, T0 + 60_000, 2);
    speichere(JANA, T0 + BEARBEITUNGSFENSTER_MS, 3); // 14:59 nach Fensterbeginn (T0+1s): noch im Fenster
    expect(audit(db)).toEqual(["create plan u-jana", "create plan_bearbeitung u-jana"]);
    speichere(JANA, T0 + 1_000 + BEARBEITUNGSFENSTER_MS, 4); // genau 15 min nach Beginn: neues Fenster
    expect(audit(db)).toEqual(["create plan u-jana", "create plan_bearbeitung u-jana", "update plan_bearbeitung u-jana"]);
  });
  it("zwei Personen abwechselnd: je Person höchstens eine Zeile im Fenster", () => {
    const db = testDb();
    const id = angelegt(db);
    let v = 1;
    for (const [i, wer] of [JANA, OLE, JANA, OLE, JANA].entries()) {
      const r = als(wer, () => speichereInhalt(db, { id, version: v, inhalt: fuegeWurzelEin(leererPlan(), `w${i}`) }, wer, T0 + (i + 1) * 60_000));
      if (!r.ok) throw new Error(JSON.stringify(r));
      v = r.version;
    }
    expect(audit(db)).toEqual(["create plan u-jana", "create plan_bearbeitung u-jana", "create plan_bearbeitung u-ole"]);
  });
  it("Planangaben: jede Änderung eine eigene Zeile; unveränderte Angaben keine", () => {
    const db = testDb();
    const id = angelegt(db);
    const r1 = als(JANA, () => speichereAngaben(db, { id, version: 1, angaben: { ...ANGABEN, titel: "Übung Nord" } }, JANA, T0 + 1));
    expect(r1).toMatchObject({ ok: true, version: 2 });
    const r2 = als(JANA, () => speichereAngaben(db, { id, version: 2, angaben: { ...ANGABEN, titel: "Übung Nord" } }, JANA, T0 + 2));
    expect(r2).toMatchObject({ ok: true, version: 3 });
    expect(audit(db)).toEqual(["create plan u-jana", "update plan u-jana"]);
  });
  it("Angaben, dann Inhalt mit der neuen Version: kein falscher Konflikt (Review Focus 5)", () => {
    const db = testDb();
    const id = angelegt(db);
    const a = als(JANA, () => speichereAngaben(db, { id, version: 1, angaben: { ...ANGABEN, anlass: "Echt" } }, JANA, T0 + 1));
    expect(a).toMatchObject({ ok: true, version: 2 });
    const b = als(JANA, () => speichereInhalt(db, { id, version: 2, inhalt: fuegeWurzelEin(leererPlan(), "w") }, JANA, T0 + 2));
    expect(b).toMatchObject({ ok: true, version: 3 });
  });
  it("Angaben mit Feldfehler: nichts geschrieben", () => {
    const db = testDb();
    const id = angelegt(db);
    expect(speichereAngaben(db, { id, version: 1, angaben: { ...ANGABEN, datum: "30.09.2026" } }, JANA, T0))
      .toEqual({ ok: false, grund: "ungueltig", fehler: "Bitte die markierten Felder prüfen.", feldFehler: { datum: "Bitte ein Datum wählen." } });
    expect(db.select().from(plan).where(eq(plan.id, id)).get()?.version).toBe(1);
  });
});
