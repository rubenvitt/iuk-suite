import { describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { plan } from "../_db/schema";
import { BEISPIELE } from "./beispiele";
import { ladePlan, ladePlanLesend, listePlaene } from "./plaene";
import { archiviere, dupliziere, PLAN_WEG, setzeVorlage, stelleWiederHer, vorlagenZurAuswahl } from "./planverwaltung";
import { seedLokalKommplan } from "./seedLokal";
import { legePlanAn, speichereInhalt } from "./speichern";
import { testDb } from "./testDb";

const WER = { nutzer: "u1", name: "Jana" };
const NACH_MITTERNACHT = Date.UTC(2026, 8, 30, 22, 30); // 01.10.2026, 00:30 in Berlin
const OPENR = "beispiel-openr-2022-07-01";
async function mitSeed() { const db = testDb(); await seedLokalKommplan(db); return db; }

describe("Duplizieren (Spec §6.7; Entscheidung 9)", () => {
  it("Kopie mit heutigem Berliner Datum, Datum im Titel ersetzt, Inhalt gleich, Version 1, keine Vorlage", async () => {
    const db = await mitSeed();
    const quelle = ladePlan(db, OPENR)!;
    const r = dupliziere(db, OPENR, WER, NACH_MITTERNACHT);
    if (!r.ok) throw new Error(r.fehler);
    const kopie = ladePlan(db, r.id)!;
    expect(kopie.titel).toBe(quelle.titel.replace("01.07.2022", "01.10.2026"));
    expect(kopie.angaben.datum).toBe("2026-10-01");
    expect(kopie.inhalt).toEqual(quelle.inhalt);
    expect(kopie).toMatchObject({ version: 1, typ: quelle.typ, anlass: quelle.anlass, aktualisiertVon: "Jana", aktualisiertAm: NACH_MITTERNACHT });
    expect(ladePlanLesend(db, r.id)).toMatchObject({ istVorlage: false, archiviertAm: null });
  });
  it("unbekannt, archiviert oder nicht lesbar: nicht dupliziert", async () => {
    const db = await mitSeed();
    expect(dupliziere(db, "gibt-es-nicht", WER, NACH_MITTERNACHT)).toMatchObject({ ok: false, fehler: PLAN_WEG });
    archiviere(db, OPENR, NACH_MITTERNACHT);
    expect(dupliziere(db, OPENR, WER, NACH_MITTERNACHT)).toMatchObject({ ok: false, fehler: PLAN_WEG });
    db.update(plan).set({ inhalt: '{"schema":2}' }).where(eq(plan.id, BEISPIELE[0].id)).run();
    expect(dupliziere(db, BEISPIELE[0].id, WER, NACH_MITTERNACHT).ok).toBe(false);
  });
});

describe("Vorlagen (Entscheidungen 7, 8)", () => {
  it("„Als Vorlage speichern“ verschiebt den Plan in die Vorlagen, „Keine Vorlage mehr“ zurück", async () => {
    const db = await mitSeed();
    expect(setzeVorlage(db, OPENR, true)).toEqual({ ok: true });
    expect(listePlaene(db, "plaene").map((z) => z.id)).not.toContain(OPENR);
    expect(listePlaene(db, "vorlagen").map((z) => z.id)).toContain(OPENR);
    expect(vorlagenZurAuswahl(db).map((v) => v.id)).toContain(OPENR);
    expect(setzeVorlage(db, OPENR, false)).toEqual({ ok: true });
    expect(listePlaene(db, "plaene").map((z) => z.id)).toContain(OPENR);
  });
  it("Neu aus Vorlage: Angaben aus dem Formular, Inhalt aus der Vorlage; archivierte Vorlage abgewiesen", async () => {
    const db = await mitSeed();
    const vorlage = vorlagenZurAuswahl(db)[0];
    const r = legePlanAn(db, { titel: "Übung", typ: "fernmeldeskizze", anlass: "", datum: null, vorlage: vorlage.id }, WER, NACH_MITTERNACHT);
    if (!r.ok) throw new Error(r.fehler);
    expect(ladePlan(db, r.id)!.inhalt).toEqual(ladePlan(db, vorlage.id)!.inhalt);
    expect(ladePlan(db, r.id)!.titel).toBe("Übung");
    archiviere(db, vorlage.id, NACH_MITTERNACHT);
    expect(legePlanAn(db, { titel: "Übung", typ: "fernmeldeskizze", anlass: "", datum: null, vorlage: vorlage.id }, WER, NACH_MITTERNACHT))
      .toEqual({ ok: false, fehler: "Bitte die markierten Felder prüfen.", feldFehler: { vorlage: "Diese Vorlage gibt es nicht mehr." } });
    expect(legePlanAn(db, { titel: "Übung", typ: "kommunikationsplan", anlass: "", datum: null, vorlage: OPENR }, WER, NACH_MITTERNACHT).ok).toBe(false); // keine Vorlage
  });
});

describe("Archiv (Spec §8.3; Entscheidung 10)", () => {
  it("archivieren: aus der Liste ins Archiv, Stand unverändert, lesend weiter ladbar; Speichern meldet „weg“", async () => {
    const db = await mitSeed();
    const vorher = ladePlan(db, OPENR)!;
    expect(archiviere(db, OPENR, NACH_MITTERNACHT)).toEqual({ ok: true });
    expect(listePlaene(db, "plaene").map((z) => z.id)).not.toContain(OPENR);
    expect(listePlaene(db, "archiv")[0]).toMatchObject({ id: OPENR, archiviert: "01.10.2026" });
    expect(ladePlan(db, OPENR)).toBeNull();
    expect(ladePlanLesend(db, OPENR)).toMatchObject({ archiviertAm: NACH_MITTERNACHT, aktualisiertAm: vorher.aktualisiertAm });
    expect(speichereInhalt(db, { id: OPENR, version: vorher.version, inhalt: vorher.inhalt }, WER, NACH_MITTERNACHT)).toEqual({ ok: false, grund: "weg" });
    expect(archiviere(db, OPENR, NACH_MITTERNACHT)).toEqual({ ok: false, fehler: PLAN_WEG }); // zweimal ist kein zweites Mal
  });
  it("wiederherstellen: zurück in die Liste; je Schritt eine Audit-Zeile", async () => {
    const db = await mitSeed();
    const zaehle = () => (db.all(sql`SELECT count(*) AS n FROM audit_outbox WHERE object_type = 'plan' AND action = 'update'`) as { n: number }[])[0].n;
    const start = zaehle();
    archiviere(db, OPENR, NACH_MITTERNACHT);
    expect(stelleWiederHer(db, OPENR)).toEqual({ ok: true });
    expect(listePlaene(db, "plaene").map((z) => z.id)).toContain(OPENR);
    expect(stelleWiederHer(db, OPENR)).toEqual({ ok: false, fehler: PLAN_WEG });
    expect(zaehle() - start).toBe(2);
  });
});
