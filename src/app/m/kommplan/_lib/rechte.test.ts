import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { plan, planMitglied } from "../_db/schema";
import { ladePlanFuer, listePlaene } from "./plaene";
import { dupliziere, speichereAlsVorlage, vorlagenZurAuswahl } from "./planverwaltung";
import { rechteAn, rechteFuer, type Person } from "./rechte";
import { seedLokalKommplan } from "./seedLokal";
import { legePlanAn } from "./speichern";
import { testDb } from "./testDb";

const T0 = Date.UTC(2026, 9, 2, 8, 0);
const ANNA = { nutzer: "u-anna", name: "Anna" };
const BODO = { nutzer: "u-bodo", name: "Bodo" };
const ALS_ANNA: Person = { nutzer: ANNA.nutzer, admin: false };
const ALS_BODO: Person = { nutzer: BODO.nutzer, admin: false };
const ADMIN: Person = { nutzer: "u-admin", admin: true };
const ANGABEN = { titel: "Annas Entwurf", typ: "kommunikationsplan", anlass: "", datum: "2026-10-02" };
const OPENR = "beispiel-openr-2022-07-01";

function annasPlan(db: ReturnType<typeof testDb>, angaben = ANGABEN): string {
  const r = legePlanAn(db, angaben, ANNA, T0, ALS_ANNA);
  if (!r.ok) throw new Error(r.fehler);
  return r.id;
}

describe("rechteFuer — die Matrix", () => {
  const privat = { sichtbarkeit: "privat" as const, eigentuemer: "u-anna", mitglied: false };
  const geteilt = { sichtbarkeit: "organisation" as const, eigentuemer: "u-anna", mitglied: false };
  it("privat: nur der Eigentümer — auch kein Admin, auch kein (übrig gebliebenes) Mitglied", () => {
    expect(rechteFuer(privat, ALS_ANNA)).toEqual({ sehen: true, bearbeiten: true, verwalten: true });
    expect(rechteFuer(privat, ADMIN)).toEqual({ sehen: false, bearbeiten: false, verwalten: false });
    expect(rechteFuer({ ...privat, mitglied: true }, ALS_BODO)).toEqual({ sehen: false, bearbeiten: false, verwalten: false });
    expect(rechteFuer(privat, { nutzer: null, admin: true })).toEqual({ sehen: false, bearbeiten: false, verwalten: false });
  });
  it("geteilt: alle sehen; Eigentümer und Admin verwalten; Eingeladene bearbeiten nur", () => {
    expect(rechteFuer(geteilt, ALS_ANNA)).toEqual({ sehen: true, bearbeiten: true, verwalten: true });
    expect(rechteFuer(geteilt, ADMIN)).toEqual({ sehen: true, bearbeiten: true, verwalten: true });
    expect(rechteFuer(geteilt, ALS_BODO)).toEqual({ sehen: true, bearbeiten: false, verwalten: false });
    expect(rechteFuer({ ...geteilt, mitglied: true }, ALS_BODO)).toEqual({ sehen: true, bearbeiten: true, verwalten: false });
  });
  it("Altbestand ohne Eigentümer: geteilt, nur Admins verwalten", () => {
    expect(rechteFuer({ ...geteilt, eigentuemer: null }, ALS_ANNA)).toEqual({ sehen: true, bearbeiten: false, verwalten: false });
    expect(rechteFuer({ ...geteilt, eigentuemer: null }, ADMIN)).toEqual({ sehen: true, bearbeiten: true, verwalten: true });
  });
});

describe("ein neuer Plan ist privat", () => {
  it("anlegen: privat, Anna gehört er; Bodo und der Admin finden ihn weder in der Liste noch per ID", async () => {
    const db = testDb();
    await seedLokalKommplan(db);
    const id = annasPlan(db);
    expect(db.select().from(plan).where(eq(plan.id, id)).get()).toMatchObject({ sichtbarkeit: "privat", eigentuemer: "u-anna" });
    expect(listePlaene(db, "plaene", ALS_ANNA).find((z) => z.id === id)).toMatchObject({ privat: true, darf: { bearbeiten: true, verwalten: true } });
    for (const wer of [ALS_BODO, ADMIN]) {
      expect(listePlaene(db, "plaene", wer).map((z) => z.id)).not.toContain(id);
      expect(ladePlanFuer(db, id, wer)).toBeNull();
      expect(rechteAn(db, id, wer)).toEqual({ sehen: false, bearbeiten: false, verwalten: false });
    }
    // Der geteilte Seed bleibt für alle sichtbar.
    expect(listePlaene(db, "plaene", ALS_BODO).find((z) => z.id === OPENR)).toMatchObject({ privat: false, darf: { bearbeiten: false, verwalten: false } });
  });
  it("Kopien sind privat und gehören dem, der kopiert — auch von einem geteilten Plan", async () => {
    const db = testDb();
    await seedLokalKommplan(db);
    const k = dupliziere(db, OPENR, BODO, T0, ALS_BODO);
    if (!k.ok) throw new Error(k.fehler);
    expect(ladePlanFuer(db, k.id, ALS_BODO)?.plan).toMatchObject({ sichtbarkeit: "privat", eigentuemer: "u-bodo" });
    expect(ladePlanFuer(db, k.id, ADMIN)).toBeNull();
    const v = speichereAlsVorlage(db, OPENR, BODO, T0, ALS_BODO);
    if (!v.ok) throw new Error(v.fehler);
    expect(vorlagenZurAuswahl(db, ALS_BODO).map((x) => x.id)).toContain(v.id);
    expect(vorlagenZurAuswahl(db, ALS_ANNA).map((x) => x.id)).not.toContain(v.id);
  });
  it("einen fremden privaten Plan kopiert niemand, und aus einer fremden privaten Vorlage legt niemand an", () => {
    const db = testDb();
    const id = annasPlan(db);
    expect(dupliziere(db, id, BODO, T0, ALS_BODO)).toMatchObject({ ok: false });
    expect(speichereAlsVorlage(db, id, BODO, T0, ALS_BODO)).toMatchObject({ ok: false });
    const v = speichereAlsVorlage(db, id, ANNA, T0, ALS_ANNA);
    if (!v.ok) throw new Error(v.fehler);
    expect(legePlanAn(db, { ...ANGABEN, titel: "Bodos", vorlage: v.id }, BODO, T0, ALS_BODO)).toMatchObject({ ok: false, feldFehler: { vorlage: expect.any(String) } });
    expect(legePlanAn(db, { ...ANGABEN, titel: "Annas zweiter", vorlage: v.id }, ANNA, T0, ALS_ANNA)).toMatchObject({ ok: true });
  });
  it("die Rückfrage „Vorlage gibt es schon“ verrät keine fremde private Vorlage", () => {
    const db = testDb();
    const annas = annasPlan(db, { ...ANGABEN, titel: "Gleicher Titel" });
    expect(speichereAlsVorlage(db, annas, ANNA, T0, ALS_ANNA)).toMatchObject({ ok: true });
    db.update(plan).set({ sichtbarkeit: "organisation" }).where(eq(plan.id, annas)).run();
    const bodos = dupliziere(db, annas, BODO, T0, ALS_BODO);
    if (!bodos.ok) throw new Error(bodos.fehler);
    db.update(plan).set({ titel: "Gleicher Titel" }).where(eq(plan.id, bodos.id)).run();
    // Annas Vorlage ist privat: für Bodo gibt es keine gleichen Titels, also legt er ohne Rückfrage an.
    expect(speichereAlsVorlage(db, bodos.id, BODO, T0, ALS_BODO)).toMatchObject({ ok: true });
  });
  it("Eingeladene sehen ihre Rechte in der Liste", async () => {
    const db = testDb();
    await seedLokalKommplan(db);
    db.insert(planMitglied).values({ planId: OPENR, nutzer: "u-bodo", name: "Bodo", eingeladenAm: new Date(T0), eingeladenVon: "Admin" }).run();
    expect(listePlaene(db, "plaene", ALS_BODO).find((z) => z.id === OPENR)?.darf).toEqual({ bearbeiten: true, verwalten: false });
  });
});
