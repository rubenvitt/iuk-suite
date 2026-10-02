import { describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { plan, planBearbeitung, planFreigabe } from "../_db/schema";
import { BEISPIELE } from "./beispiele";
import { loeseToken, stelleFreigabeAus } from "./freigaben";
import { FRISCH_MS, ladePlanLesend, listePlaene } from "./plaene";
import {
  archiviere, dupliziere, loescheEndgueltig, loescheOhneArchiv, NICHT_MEHR_FRISCH, NUR_ARCHIVIERT, PLAN_WEG, SCHON_ARCHIVIERT,
  speichereAlsVorlage, stelleWiederHer, vorlagenZurAuswahl,
} from "./planverwaltung";
import { seedLokalKommplan } from "./seedLokal";
import { legePlanAn, speichereInhalt } from "./speichern";
import { testDb } from "./testDb";

const WER = { nutzer: "u1", name: "Jana" };
const NACH_MITTERNACHT = Date.UTC(2026, 8, 30, 22, 30); // 01.10.2026, 00:30 in Berlin
const OPENR = "beispiel-openr-2022-07-01";
async function mitSeed() { const db = testDb(); await seedLokalKommplan(db); return db; }
/** Nur aktive Pläne — wie früher `ladePlan`, das kein Produktionspfad mehr brauchte (Abnahme). */
function ladePlan(db: ReturnType<typeof testDb>, id: string) {
  const p = ladePlanLesend(db, id);
  return p && p.archiviertAm === null ? p : null;
}

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
  it("meldet, was mit dem Titel geschah: ersetzt, „(Kopie)“ angehängt — auch am selben Tag", async () => {
    const db = await mitSeed();
    const r = dupliziere(db, OPENR, WER, NACH_MITTERNACHT);
    expect(r).toMatchObject({ ok: true, titel: "datum" });
    if (!r.ok) return;
    // Die Kopie trägt schon das heutige Datum: noch einmal duplizieren hieße sonst gleich.
    const zweite = dupliziere(db, r.id, WER, NACH_MITTERNACHT);
    expect(zweite).toMatchObject({ ok: true, titel: "zusatz" });
    if (!zweite.ok) return;
    expect(ladePlan(db, zweite.id)!.titel).toBe(`${ladePlan(db, r.id)!.titel} (Kopie)`);
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

describe("Planverwaltung — Grenzfälle (Review Phase 4)", () => {
  it("die Kopie einer Vorlage ist ein Plan, keine zweite Vorlage", async () => {
    const db = await mitSeed();
    const v = vorlagenZurAuswahl(db)[0];
    const r = dupliziere(db, v.id, WER, NACH_MITTERNACHT);
    if (!r.ok) throw new Error(r.fehler);
    expect(ladePlanLesend(db, r.id)).toMatchObject({ istVorlage: false });
  });
  it("das Archiv ordnet nach dem Archivzeitpunkt (zuletzt archiviert zuerst), nicht nach dem Stand", async () => {
    const db = await mitSeed();
    const [a, b] = BEISPIELE.map((x) => x.id).filter((id) => id !== OPENR).slice(0, 2);
    // a hat den jüngeren Stand, wird aber ZUERST archiviert
    db.update(plan).set({ aktualisiertAm: new Date(NACH_MITTERNACHT) }).where(eq(plan.id, a)).run();
    db.update(plan).set({ aktualisiertAm: new Date(NACH_MITTERNACHT - 86_400_000) }).where(eq(plan.id, b)).run();
    archiviere(db, a, NACH_MITTERNACHT + 1000);
    archiviere(db, b, NACH_MITTERNACHT + 2000);
    expect(listePlaene(db, "archiv").map((z) => z.id)).toEqual([b, a]);
  });
});

describe("Vorlagen (Entscheidungen 7, 8)", () => {
  it("„Als Vorlage speichern“ legt eine KOPIE als Vorlage an — Titel gleich, Datum leer, Ausgangsplan unverändert (Phase 5, Entscheidung 16)", async () => {
    const db = await mitSeed();
    const vorher = ladePlanLesend(db, OPENR)!;
    const r = speichereAlsVorlage(db, OPENR, WER, NACH_MITTERNACHT);
    if (!r.ok) throw new Error(r.fehler);
    expect(r.id).not.toBe(OPENR);
    expect(ladePlanLesend(db, OPENR)).toEqual(vorher); // Ausgangsplan unberührt, auch der Stand
    expect(listePlaene(db, "plaene").map((z) => z.id)).toContain(OPENR);
    const v = ladePlanLesend(db, r.id)!;
    expect(v).toMatchObject({ titel: vorher.titel, typ: vorher.typ, anlass: vorher.anlass, datum: null, istVorlage: true, archiviertAm: null, version: 1, aktualisiertAm: NACH_MITTERNACHT, aktualisiertVon: "Jana" });
    expect(v.inhalt).toEqual(vorher.inhalt);
    expect(vorlagenZurAuswahl(db).map((x) => x.id)).toContain(r.id);
  });
  it("gleicher Titel schon als aktive Vorlage: nichts angelegt, die vorhandene genannt — erst `trotzdem` legt eine zweite an", async () => {
    const db = await mitSeed();
    const erste = speichereAlsVorlage(db, OPENR, WER, NACH_MITTERNACHT);
    if (!erste.ok) throw new Error(erste.fehler);
    const anzahl = () => vorlagenZurAuswahl(db).length;
    const vorher = anzahl();
    const zweite = speichereAlsVorlage(db, OPENR, WER, NACH_MITTERNACHT);
    expect(zweite).toEqual({ ok: false, fehler: `Eine Vorlage „${ladePlan(db, OPENR)!.titel}“ gibt es schon — sie steht unter „Vorlagen“.`, feldFehler: {}, vorhanden: erste.id });
    expect(anzahl()).toBe(vorher);
    expect(speichereAlsVorlage(db, OPENR, WER, NACH_MITTERNACHT, true).ok).toBe(true);
    expect(anzahl()).toBe(vorher + 1);
    // Eine archivierte Vorlage gleichen Titels zählt nicht.
    const db2 = await mitSeed();
    const alt = speichereAlsVorlage(db2, OPENR, WER, NACH_MITTERNACHT);
    if (!alt.ok) throw new Error(alt.fehler);
    archiviere(db2, alt.id, NACH_MITTERNACHT);
    expect(speichereAlsVorlage(db2, OPENR, WER, NACH_MITTERNACHT).ok).toBe(true);
  });
  it("aus einer Vorlage, einem archivierten oder unbekannten Plan wird keine Vorlage", async () => {
    const db = await mitSeed();
    const vorlage = vorlagenZurAuswahl(db)[0];
    expect(speichereAlsVorlage(db, vorlage.id, WER, NACH_MITTERNACHT)).toEqual({ ok: false, fehler: PLAN_WEG, feldFehler: {} });
    archiviere(db, OPENR, NACH_MITTERNACHT);
    expect(speichereAlsVorlage(db, OPENR, WER, NACH_MITTERNACHT).ok).toBe(false);
    expect(speichereAlsVorlage(db, "gibt-es-nicht", WER, NACH_MITTERNACHT).ok).toBe(false);
  });
  it("„Vorlage archivieren“ = archivieren: die Vorlage verschwindet aus der Auswahl und kehrt beim Wiederherstellen als Vorlage zurück", async () => {
    const db = await mitSeed();
    const vorlage = vorlagenZurAuswahl(db)[0];
    archiviere(db, vorlage.id, NACH_MITTERNACHT);
    expect(vorlagenZurAuswahl(db).map((x) => x.id)).not.toContain(vorlage.id);
    expect(listePlaene(db, "archiv").find((z) => z.id === vorlage.id)?.vorlage).toBe(true);
    stelleWiederHer(db, vorlage.id);
    expect(listePlaene(db, "vorlagen").map((z) => z.id)).toContain(vorlage.id);
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

describe("Löschen (Auftrag 2026-10-02): endgültig nur aus dem Archiv, ohne Archiv nur frisch", () => {
  const ANLAGE = { titel: "Versehen", typ: "kommunikationsplan", anlass: "", datum: null };
  function lege(db: ReturnType<typeof testDb>, jetzt = NACH_MITTERNACHT): string {
    const r = legePlanAn(db, ANLAGE, WER, jetzt);
    if (!r.ok) throw new Error(r.fehler);
    return r.id;
  }
  /** Ein Link und eine Bearbeitungszeile: beides zeigt per Fremdschlüssel auf den Plan. */
  function mitAnhang(db: ReturnType<typeof testDb>, id: string, jetzt = NACH_MITTERNACHT): string {
    const f = stelleFreigabeAus(db, { planId: id, dauer: "7d", notiz: "" }, WER, jetzt);
    if (!f.ok) throw new Error(f.fehler);
    const p = ladePlan(db, id)!;
    expect(speichereInhalt(db, { id, version: p.version, inhalt: p.inhalt }, WER, jetzt).ok).toBe(true);
    return f.freigaben[0].token;
  }
  const zeilen = (db: ReturnType<typeof testDb>, id: string) => ({
    plan: db.select().from(plan).where(eq(plan.id, id)).all().length,
    freigaben: db.select().from(planFreigabe).where(eq(planFreigabe.planId, id)).all().length,
    bearbeitung: db.select().from(planBearbeitung).where(eq(planBearbeitung.planId, id)).all().length,
  });
  const geloeschtImAudit = (db: ReturnType<typeof testDb>) =>
    (db.all(sql`SELECT object_type AS t FROM audit_outbox WHERE action = 'delete' ORDER BY object_type`) as { t: string }[]).map((z) => z.t);

  it("Anlegen, Duplizieren und „Als Vorlage speichern“ tragen den Anlagezeitpunkt; der Seed seinen Stand", async () => {
    const db = await mitSeed();
    const erstellt = (id: string) => db.select({ e: plan.erstelltAm }).from(plan).where(eq(plan.id, id)).get()!.e?.getTime();
    expect(erstellt(lege(db))).toBe(NACH_MITTERNACHT);
    const d = dupliziere(db, OPENR, WER, NACH_MITTERNACHT + 1);
    const v = speichereAlsVorlage(db, OPENR, WER, NACH_MITTERNACHT + 2);
    if (!d.ok || !v.ok) throw new Error("nicht angelegt");
    expect([erstellt(d.id), erstellt(v.id)]).toEqual([NACH_MITTERNACHT + 1, NACH_MITTERNACHT + 2]);
    expect(erstellt(OPENR)).toBe(new Date(BEISPIELE.find((b) => b.id === OPENR)!.stand).getTime());
  });

  it("ohne Archiv: frisch gelöscht — mit Links und Bearbeitungszeilen in einem Zug, je Zeile eine Audit-Zeile; der Link ist tot", async () => {
    const db = await mitSeed();
    const id = lege(db);
    const token = mitAnhang(db, id);
    expect(zeilen(db, id)).toEqual({ plan: 1, freigaben: 1, bearbeitung: 1 });
    const vorher = geloeschtImAudit(db);
    expect(loescheOhneArchiv(db, id, NACH_MITTERNACHT + FRISCH_MS - 1)).toEqual({ ok: true });
    expect(zeilen(db, id)).toEqual({ plan: 0, freigaben: 0, bearbeitung: 0 });
    expect(geloeschtImAudit(db)).toEqual([...vorher, "plan", "plan_bearbeitung", "plan_freigabe"].sort());
    expect(loeseToken(db, token, NACH_MITTERNACHT + 1)).toBeNull();
    expect(ladePlanLesend(db, id)).toBeNull();
    expect(loescheOhneArchiv(db, id, NACH_MITTERNACHT)).toEqual({ ok: false, fehler: PLAN_WEG }); // zweimal ist kein zweites Mal
  });

  it("ohne Archiv: ab einer Stunde, ohne Anlagezeitpunkt (Altbestand) und archiviert abgelehnt — der Plan bleibt", async () => {
    const db = await mitSeed();
    const id = lege(db);
    expect(loescheOhneArchiv(db, id, NACH_MITTERNACHT + FRISCH_MS)).toEqual({ ok: false, fehler: NICHT_MEHR_FRISCH }); // genau an der Grenze
    expect(loescheOhneArchiv(db, OPENR, NACH_MITTERNACHT)).toEqual({ ok: false, fehler: NICHT_MEHR_FRISCH }); // Seed: alt
    db.update(plan).set({ erstelltAm: null }).where(eq(plan.id, id)).run();
    expect(loescheOhneArchiv(db, id, NACH_MITTERNACHT)).toEqual({ ok: false, fehler: NICHT_MEHR_FRISCH });
    const jung = lege(db);
    archiviere(db, jung, NACH_MITTERNACHT);
    expect(loescheOhneArchiv(db, jung, NACH_MITTERNACHT)).toEqual({ ok: false, fehler: SCHON_ARCHIVIERT });
    expect(loescheOhneArchiv(db, "gibt-es-nicht", NACH_MITTERNACHT)).toEqual({ ok: false, fehler: PLAN_WEG });
    expect([zeilen(db, id).plan, zeilen(db, jung).plan, zeilen(db, OPENR).plan]).toEqual([1, 1, 1]);
  });

  it("endgültig: nur archiviert — dann samt widerrufener Links und Bearbeitungszeilen, gleich wie alt", async () => {
    const db = await mitSeed();
    const id = lege(db);
    mitAnhang(db, id);
    expect(loescheEndgueltig(db, id)).toEqual({ ok: false, fehler: NUR_ARCHIVIERT });
    expect(zeilen(db, id)).toEqual({ plan: 1, freigaben: 1, bearbeitung: 1 });
    archiviere(db, id, NACH_MITTERNACHT);
    archiviere(db, OPENR, NACH_MITTERNACHT);
    expect(loescheEndgueltig(db, id)).toEqual({ ok: true });
    expect(loescheEndgueltig(db, OPENR)).toEqual({ ok: true }); // alt ist hier kein Hindernis
    expect(zeilen(db, id)).toEqual({ plan: 0, freigaben: 0, bearbeitung: 0 });
    expect(listePlaene(db, "archiv").map((z) => z.id)).not.toContain(OPENR);
    expect(loescheEndgueltig(db, id)).toEqual({ ok: false, fehler: PLAN_WEG });
  });

  it("eine Vorlage zu löschen lässt die Pläne aus ihr stehen — sie tragen eine Kopie des Inhalts", async () => {
    const db = await mitSeed();
    const vorlage = vorlagenZurAuswahl(db)[0];
    const r = legePlanAn(db, { ...ANLAGE, vorlage: vorlage.id }, WER, NACH_MITTERNACHT);
    if (!r.ok) throw new Error(r.fehler);
    const inhalt = ladePlan(db, r.id)!.inhalt;
    archiviere(db, vorlage.id, NACH_MITTERNACHT);
    expect(loescheEndgueltig(db, vorlage.id)).toEqual({ ok: true });
    expect(ladePlan(db, r.id)!.inhalt).toEqual(inhalt);
  });

  it("die Liste markiert frische Zeilen nach der übergebenen Serveruhr — archivierte und ohne Uhr nie", async () => {
    const db = await mitSeed();
    const id = lege(db);
    const frisch = (liste: "plaene" | "archiv", jetzt?: number) => listePlaene(db, liste, jetzt).find((z) => z.id === id)?.frisch;
    expect(frisch("plaene", NACH_MITTERNACHT + FRISCH_MS - 1)).toBe(true);
    expect(frisch("plaene", NACH_MITTERNACHT + FRISCH_MS)).toBe(false);
    expect(frisch("plaene")).toBe(false);
    expect(listePlaene(db, "plaene", NACH_MITTERNACHT).filter((z) => z.frisch).map((z) => z.id)).toEqual([id]);
    archiviere(db, id, NACH_MITTERNACHT);
    expect(frisch("archiv", NACH_MITTERNACHT)).toBe(false);
  });
});
