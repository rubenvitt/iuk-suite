import { describe, expect, it } from "vitest";
import { AUSTAUSCH_FORMAT, AUSTAUSCH_VERSION, austauschDateiname, importierePlan, lesePlanDatei, planDatei } from "./austausch";
import { AUSTAUSCH_MAX_BYTES } from "./austauschGrenzen";
import { BEISPIELE } from "./beispiele";
import { stelleFreigabeAus } from "./freigaben";
import { ladePlanFuer, ladePlanLesend } from "./plaene";
import { seedLokalKommplan } from "./seedLokal";
import { testDb } from "./testDb";

const T0 = Date.UTC(2026, 9, 2, 8, 0);
const ANNA = { nutzer: "u-anna", name: "Anna" };
const ADMIN = { nutzer: "u-admin", admin: true };

describe("Austauschformat .kommplan.json", () => {
  it("jedes Beispiel übersteht Export → JSON → Import unverändert, als neuer privater Plan der importierenden Person", async () => {
    const db = testDb();
    await seedLokalKommplan(db);
    for (const b of BEISPIELE) {
      const p = ladePlanLesend(db, b.id)!;
      if (!p.inhalt) continue; // das absichtlich unlesbare Beispiel exportiert nicht
      const text = JSON.stringify(planDatei({ ...p, inhalt: p.inhalt }, T0));
      expect(text.length).toBeLessThan(AUSTAUSCH_MAX_BYTES);
      const r = importierePlan(db, JSON.parse(text), ANNA, T0);
      if (!r.ok) throw new Error(`${b.id}: ${r.fehler}`);
      const neu = ladePlanLesend(db, r.id)!;
      expect(neu.id).not.toBe(p.id);
      expect({ inhalt: neu.inhalt, angaben: neu.angaben, vorlage: neu.istVorlage }).toEqual({ inhalt: p.inhalt, angaben: p.angaben, vorlage: p.istVorlage });
      expect(neu).toMatchObject({ sichtbarkeit: "privat", eigentuemer: "u-anna", aktualisiertVon: "Anna", version: 1 });
      expect(ladePlanFuer(db, r.id, ADMIN)).toBeNull();
    }
  });
  it("die Datei trägt weder Eigentümer noch Links noch Plan-ID", async () => {
    const db = testDb();
    await seedLokalKommplan(db);
    const id = "beispiel-openr-2022-07-01";
    const f = stelleFreigabeAus(db, { planId: id, dauer: "7d", notiz: "" }, ANNA, T0, ADMIN);
    if (!f.ok) throw new Error(f.fehler);
    const p = ladePlanLesend(db, id)!;
    const text = JSON.stringify(planDatei({ ...p, inhalt: p.inhalt! }, T0));
    expect(text).not.toContain(f.freigaben[0].token);
    expect(text).not.toContain(id);
    expect(Object.keys(JSON.parse(text))).toEqual(["format", "version", "exportiertAm", "plan"]);
    expect(Object.keys(JSON.parse(text).plan).sort()).toEqual(["anlass", "datum", "inhalt", "titel", "typ", "vorlage"]);
  });
  it("weist fremde, neuere und kaputte Dateien mit einem lesbaren Satz ab", () => {
    expect(lesePlanDatei({ hallo: 1 })).toEqual({ ok: false, fehler: "Das ist keine Plandatei der Kommunikationspläne." });
    expect(lesePlanDatei(null)).toMatchObject({ ok: false });
    expect(lesePlanDatei({ format: AUSTAUSCH_FORMAT, version: 1 })).toEqual({ ok: false, fehler: "Die Datei ist unvollständig." });
    const gut = { format: AUSTAUSCH_FORMAT, version: AUSTAUSCH_VERSION, plan: { titel: "X", typ: "fernmeldeskizze", anlass: null, datum: null, inhalt: BEISPIELE[0].inhalt } };
    expect(lesePlanDatei(gut)).toMatchObject({ ok: true, vorlage: false, angaben: { titel: "X", typ: "fernmeldeskizze" } });
    expect(lesePlanDatei({ ...gut, version: AUSTAUSCH_VERSION + 1 })).toMatchObject({ ok: false, fehler: expect.stringContaining("neueren Fassung") });
    expect(lesePlanDatei({ ...gut, plan: { ...gut.plan, titel: "" } })).toMatchObject({ ok: false, fehler: expect.stringContaining("Planangaben") });
    expect(lesePlanDatei({ ...gut, plan: { ...gut.plan, typ: "skizze" } })).toMatchObject({ ok: false });
    expect(lesePlanDatei({ ...gut, plan: { ...gut.plan, inhalt: { schema: 1, stellen: "kaputt" } } })).toMatchObject({ ok: false, fehler: expect.stringContaining("Planinhalt") });
  });
  it("Dateiname: ASCII, Tag aus dem Datum oder dem Stand", () => {
    expect(austauschDateiname({ titel: "Übung Süd", datum: Date.UTC(2026, 6, 1), aktualisiertAm: T0 })).toBe("Uebung-Sued_2026-07-01.kommplan.json");
    expect(austauschDateiname({ titel: "!!!", datum: null, aktualisiertAm: T0 })).toBe("kommunikationsplan_2026-10-02.kommplan.json");
  });
});
