import { describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { bibStelle } from "../_db/schema";
import { EINTRAG_WEG, importiereBibEinheiten, importiereBibVerbindungen, ladeBibliothek, loescheBibEintrag, speichereBibEinheit, speichereBibStelle, speichereBibVerbindung } from "./bibliothekDb";
import { BIB_GRENZE } from "./bibliothek/schema";
import { seedLokalKommplan } from "./seedLokal";
import { testDb } from "./testDb";

const STELLE = { id: null, titel: "EAL Nord", zeichen: "zusatz:eal", leiter: "Jana", kontakte: [{ art: "telefon", wert: "0581 1" }, { art: "fax", wert: "  " }], notiz: "" };
async function mitSeed() { const db = testDb(); await seedLokalKommplan(db); return db; }

describe("Bibliothek in der Datenbank (Spec §4.3; Entscheidung 11)", () => {
  it("leer ist leer; nach dem Seed sortiert und mit gelesenen Kontakten", async () => {
    expect(ladeBibliothek(testDb())).toEqual({ stellen: [], einheiten: [], verbindungen: [] });
    const b = ladeBibliothek(await mitSeed());
    expect(b.stellen[0]).toMatchObject({ titel: "Leitstelle Uelzen", kontakte: expect.arrayContaining([{ art: "telefon", wert: "0581 / 82 266" }]) });
    expect(b.einheiten.map((e) => e.typ)).toEqual(["KTW", "MTW", "RTW"]);
    expect(b.verbindungen.map((v) => v.bezeichnung)).toEqual(["R_UE_1", "R_UE_2", "R_UE_3"]);
  });
  it("Stelle anlegen: leere Kontakte und leere Notiz fallen weg; ändern; unbekannte ID", async () => {
    const db = testDb();
    const r = speichereBibStelle(db, STELLE);
    if (!r.ok) throw new Error(r.fehler);
    expect(r.eintrag).toMatchObject({ titel: "EAL Nord", kontakte: [{ art: "telefon", wert: "0581 1" }], notiz: null });
    expect(speichereBibStelle(db, { ...STELLE, id: r.eintrag.id, leiter: "Ole" })).toMatchObject({ ok: true, eintrag: { leiter: "Ole" } });
    expect(speichereBibStelle(db, { ...STELLE, id: "gibt-es-nicht", titel: "Neu" })).toEqual({ ok: false, fehler: EINTRAG_WEG });
  });
  it("Dubletten: Stelle nach Titel (auch umbenannt), Einheit nach Rufname, Verbindung nach Bezeichnung UND Art", async () => {
    const db = await mitSeed();
    expect(speichereBibStelle(db, { ...STELLE, titel: " leitstelle   UELZEN " })).toMatchObject({ ok: false, feldFehler: { titel: "„Leitstelle Uelzen“ steht schon in der Bibliothek." } });
    const eal = speichereBibStelle(db, STELLE);
    if (!eal.ok) throw new Error(eal.fehler);
    expect(speichereBibStelle(db, { ...STELLE, id: eal.eintrag.id, titel: "Leitstelle Uelzen" }).ok).toBe(false);
    expect(speichereBibEinheit(db, { id: null, typ: "NEF", rufname: "rk ue 40-83-5", zeichen: null, notiz: null })).toMatchObject({ ok: false, feldFehler: { rufname: expect.stringContaining("schon in der Bibliothek") } });
    expect(speichereBibVerbindung(db, { id: null, art: "dmo", bezeichnung: "R_UE_1", notiz: null }).ok).toBe(true);
    expect(speichereBibVerbindung(db, { id: null, art: "tmo", bezeichnung: "r_ue_1", notiz: null }).ok).toBe(false);
  });
  it("Pflichtfelder und Grenzen als Feldfehler", () => {
    const db = testDb();
    expect(speichereBibStelle(db, { ...STELLE, titel: "  " })).toMatchObject({ ok: false, feldFehler: { titel: "Bitte einen Titel eintragen." } });
    expect(speichereBibEinheit(db, { id: null, typ: "RTW", rufname: "", zeichen: null, notiz: null })).toMatchObject({ ok: false, feldFehler: { rufname: "Bitte einen Rufnamen eintragen." } });
    expect(speichereBibVerbindung(db, { id: null, art: "funk", bezeichnung: "X", notiz: null })).toMatchObject({ ok: false, feldFehler: { art: "Bitte eine Art wählen." } });
    expect(speichereBibStelle(db, { ...STELLE, notiz: "x".repeat(BIB_GRENZE.notiz + 1) })).toMatchObject({ ok: false, feldFehler: { notiz: `Höchstens ${BIB_GRENZE.notiz} Zeichen.` } });
  });
  it("beschädigte Kontakte in der Datenbank lesen sich als leere Liste, nicht als Absturz", async () => {
    const db = await mitSeed();
    db.update(bibStelle).set({ kontakte: '[{"art":"brieftaube","wert":"x"}]' }).where(eq(bibStelle.id, "bib-lts-uelzen")).run();
    expect(ladeBibliothek(db).stellen.find((s) => s.id === "bib-lts-uelzen")?.kontakte).toEqual([]);
  });
  it("löschen: Eintrag weg, Audit-Zeile; unbekannt → EINTRAG_WEG", async () => {
    const db = await mitSeed();
    expect(loescheBibEintrag(db, { art: "einheit", id: "bib-einheit-1" })).toEqual({ ok: true });
    expect(loescheBibEintrag(db, { art: "einheit", id: "bib-einheit-1" })).toEqual({ ok: false, fehler: EINTRAG_WEG });
    expect(loescheBibEintrag(db, { art: "plan", id: "x" }).ok).toBe(false);
    expect((db.all(sql`SELECT count(*) AS n FROM audit_outbox WHERE object_type = 'bib_einheit' AND action = 'delete'`) as { n: number }[])[0].n).toBe(1);
  });
  it("Import: Dubletten gegen die Bibliothek UND in der Liste werden übersprungen, in einer Transaktion", async () => {
    const db = await mitSeed();
    const r = importiereBibEinheiten(db, [
      { typ: "RTW", rufname: " rk ue 40-83-5", notiz: null },
      { typ: "KTW", rufname: "RK UE 41-92-8", notiz: "Reserve" },
      { typ: "KTW", rufname: "rk ue 41-92-8 ", notiz: null },
    ]);
    expect(r).toEqual({ ok: true, angelegt: 1, uebersprungen: 2, eintraege: [expect.objectContaining({ typ: "KTW", rufname: "RK UE 41-92-8", notiz: "Reserve", zeichen: null })] });
    expect(ladeBibliothek(db).einheiten.find((e) => e.rufname === "RK UE 41-92-8")).toMatchObject({ typ: "KTW", notiz: "Reserve" });
    expect(importiereBibEinheiten(db, [{ typ: "NEF", rufname: "RK UE 40-82-1", notiz: null, zeichen: "rezept:F.2.3" }])).toMatchObject({ ok: true, eintraege: [{ zeichen: "rezept:F.2.3" }] });
  });
  it("Verbindungen importieren (aus dem Plan): Dubletten nach Bezeichnung UND Art übersprungen, angelegte zurück", async () => {
    const db = await mitSeed();
    const r = importiereBibVerbindungen(db, [
      { art: "tmo", bezeichnung: " r_ue_1 " }, { art: "dmo", bezeichnung: "R_UE_1" }, { art: "dmo", bezeichnung: "r_ue_1" },
    ]);
    expect(r).toEqual({ ok: true, angelegt: 1, uebersprungen: 2, eintraege: [expect.objectContaining({ art: "dmo", bezeichnung: "R_UE_1", notiz: null })] });
    expect(importiereBibVerbindungen(db, [{ art: "funk", bezeichnung: "X" }])).toMatchObject({ ok: false });
  });
  it("Grenze 2000 Einheiten: weder einzeln noch per Import darüber; Ändern bleibt möglich (Review Phase 4)", () => {
    const db = testDb();
    for (let block = 0; block < 4; block++) {
      expect(importiereBibEinheiten(db, Array.from({ length: 500 }, (_, i) => ({ typ: "KTW", rufname: `K ${block}-${i}`, notiz: null })))).toMatchObject({ ok: true, angelegt: 500 });
    }
    expect(ladeBibliothek(db).einheiten).toHaveLength(BIB_GRENZE.eintraege);
    const zuViele = { ok: false, fehler: `Höchstens ${BIB_GRENZE.eintraege} Einheiten in der Bibliothek.` };
    expect(speichereBibEinheit(db, { id: null, typ: "RTW", rufname: "Einer zu viel", zeichen: null, notiz: null })).toEqual(zuViele);
    expect(importiereBibEinheiten(db, [{ typ: "RTW", rufname: "Einer zu viel", notiz: null }])).toEqual(zuViele);
    const erste = ladeBibliothek(db).einheiten[0];
    expect(speichereBibEinheit(db, { ...erste, notiz: "geändert" })).toMatchObject({ ok: true });
    expect(ladeBibliothek(db).einheiten).toHaveLength(BIB_GRENZE.eintraege);
  });
  it("Import: leer, über 500 Zeilen oder mit ungültiger Zeile — nichts angelegt, Meldung mit Zeilennummer", () => {
    const db = testDb();
    expect(importiereBibEinheiten(db, [])).toEqual({ ok: false, fehler: "Die Liste ist leer." });
    expect(importiereBibEinheiten(db, Array.from({ length: 501 }, (_, i) => ({ typ: "KTW", rufname: `K ${i}`, notiz: null }))).ok).toBe(false);
    expect(importiereBibEinheiten(db, [{ typ: "RTW", rufname: "A", notiz: null }, { typ: "RTW", rufname: "", notiz: null }]))
      .toEqual({ ok: false, fehler: "Zeile 2: Bitte einen Rufnamen eintragen." });
    expect(ladeBibliothek(db).einheiten).toEqual([]);
  });
});
