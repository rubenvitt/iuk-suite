import { and, eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setzeAktiveZeitzone, STANDARD_ZEITZONE } from "@/core/zeit";
import { anker, fahrzeug, rechner, schluesselpaar, sitzung } from "../../_db/schema";
import { ausBase64 } from "../kern/bytes";
import { ENTWICKLUNGS_KEK } from "../schluessel/kek";
import { echtesPaar, legePaarAn } from "../schluessel/paar";
import { testDb, type TestDb } from "../testDb";
import { aktiverEchterRechner, loescheTestRechner, richteEin, widerrufe } from "./rechner";
import { erzeugeSitzung, sitzungAus, type SitzungZeile } from "./sitzung";
import { baueStammdatenpaket } from "./stammdatenpaket";
import { hashVon } from "./token";
import { einrichtenAntwort } from "./vertrag";

const JETZT = new Date("2026-09-25T08:00:00Z");
const env = { EINSATZBUCH_SCHLUESSEL_KEK: ENTWICKLUNGS_KEK };
const kek = ausBase64(ENTWICKLUNGS_KEK);

beforeEach(() => setzeAktiveZeitzone(STANDARD_ZEITZONE));
afterEach(() => setzeAktiveZeitzone(STANDARD_ZEITZONE));

async function mitEchtemPaar() {
  const db = testDb();
  await legePaarAn(db, { art: "echt", rechnerId: null, kek, jetzt: JETZT });
  return db;
}

function sitzungFuer(
  db: TestDb,
  einrichtung: { art: "echt" | "test"; name: string; ersetzen: boolean } | null,
  o: { sub?: string; name?: string; rechnerId?: string | null } = {},
): SitzungZeile {
  const { token } = erzeugeSitzung(db, { sub: o.sub ?? "sub-1", name: o.name ?? "Jana Albers", rechnerId: o.rechnerId ?? null, einrichtung, jetzt: JETZT });
  const s = sitzungAus(db, token, JETZT);
  if (!s) throw new Error("Sitzung fehlt");
  return s;
}

const zaehle = (db: TestDb) => ({
  rechner: db.select().from(rechner).all().length,
  paare: db.select().from(schluesselpaar).all().length,
});

describe("richteEin — Test-Rechner", () => {
  it("legt Rechner und eigenes Test-Paar an; Rückgabeschlüssel ist dessen SPKI, das Token steht nur als Hash in der DB", async () => {
    const db = await mitEchtemPaar();
    const s = sitzungFuer(db, { art: "test", name: "Übungsrechner", ersetzen: false });
    const e = await richteEin(db, s, { art: "test", name: "Übungsrechner" }, { jetzt: JETZT, env });
    if (!e.ok) throw new Error(e.code);
    const a = e.antwort;
    expect(einrichtenAntwort.safeParse(a).success).toBe(true);
    expect(a).toMatchObject({ art: "test", name: "Übungsrechner", eingerichtetVon: "Jana Albers", eingerichtetAm: "2026-09-25T10:00:00+02:00" });
    expect(a.paket).toEqual(baueStammdatenpaket(db));

    const r = db.select().from(rechner).where(eq(rechner.id, a.rechnerId)).get();
    expect(r).toMatchObject({ art: "test", name: "Übungsrechner", tokenHash: hashVon(a.geraeteToken), eingerichtetVon: "Jana Albers", eingerichtetVonSub: "sub-1", widerrufenAm: null });
    expect(JSON.stringify(db.select().from(rechner).all())).not.toContain(a.geraeteToken);

    const paar = db.select().from(schluesselpaar).where(eq(schluesselpaar.rechnerId, a.rechnerId)).get();
    expect(paar).toMatchObject({ art: "test", oeffentlich: a.oeffentlichSpki, schluesselId: a.schluesselId });
    expect(a.schluesselId).not.toBe(echtesPaar(db)?.schluesselId);
  });

  it("bindet die Sitzung an den neuen Rechner und markiert sie als eingerichtet", async () => {
    const db = await mitEchtemPaar();
    const s = sitzungFuer(db, { art: "test", name: "Übungsrechner", ersetzen: false });
    const e = await richteEin(db, s, { art: "test", name: "Übungsrechner" }, { jetzt: JETZT, env });
    if (!e.ok) throw new Error(e.code);
    expect(db.select().from(sitzung).where(eq(sitzung.tokenHash, s.tokenHash)).get()).toMatchObject({ rechnerId: e.antwort.rechnerId, eingerichtet: true });
  });

  it("ein zweites richteEin mit derselben Sitzung: 409 schon_eingerichtet, nichts Neues", async () => {
    const db = await mitEchtemPaar();
    const s = sitzungFuer(db, { art: "test", name: "Übungsrechner", ersetzen: false });
    expect((await richteEin(db, s, { art: "test", name: "Übungsrechner" }, { jetzt: JETZT, env })).ok).toBe(true);
    const vorher = zaehle(db);
    expect(await richteEin(db, s, { art: "test", name: "Übungsrechner" }, { jetzt: JETZT, env })).toMatchObject({ ok: false, status: 409, code: "schon_eingerichtet" });
    expect(zaehle(db)).toEqual(vorher);
  });
});

describe("richteEin — echter Rechner", () => {
  it("ohne aktiven echten Rechner: legt ihn an und liefert das echte Paar", async () => {
    const db = await mitEchtemPaar();
    const s = sitzungFuer(db, { art: "echt", name: "Einsatzleitung", ersetzen: false });
    const e = await richteEin(db, s, { art: "echt", name: "Einsatzleitung" }, { jetzt: JETZT, env });
    if (!e.ok) throw new Error(e.code);
    const echt = echtesPaar(db);
    expect(e.antwort).toMatchObject({ art: "echt", name: "Einsatzleitung", oeffentlichSpki: echt?.oeffentlich, schluesselId: echt?.schluesselId });
    expect(aktiverEchterRechner(db)?.id).toBe(e.antwort.rechnerId);
    expect(db.select().from(schluesselpaar).all()).toHaveLength(1);
  });

  it("bei aktivem echtem Rechner ohne ersetzen: 409 echt_vorhanden mit eingerichtetAm/eingerichtetVon — und nichts ist geändert", async () => {
    const db = await mitEchtemPaar();
    const erste = sitzungFuer(db, { art: "echt", name: "Einsatzleitung", ersetzen: false }, { name: "Ole Brandt", sub: "sub-2" });
    const alt = await richteEin(db, erste, { art: "echt", name: "Einsatzleitung" }, { jetzt: JETZT, env });
    if (!alt.ok) throw new Error(alt.code);

    const s = sitzungFuer(db, { art: "echt", name: "Ersatzrechner", ersetzen: false });
    const vorher = { ...zaehle(db), rechnerZeilen: db.select().from(rechner).all(), sitzung: db.select().from(sitzung).where(eq(sitzung.tokenHash, s.tokenHash)).get() };
    const e = await richteEin(db, s, { art: "echt", name: "Ersatzrechner" }, { jetzt: new Date(JETZT.getTime() + 3_600_000), env });
    expect(e).toEqual({
      ok: false, status: 409, code: "echt_vorhanden", message: expect.stringContaining("Ole Brandt"),
      extra: { eingerichtetAm: "2026-09-25T10:00:00+02:00", eingerichtetVon: "Ole Brandt" },
    });
    expect({ ...zaehle(db), rechnerZeilen: db.select().from(rechner).all(), sitzung: db.select().from(sitzung).where(eq(sitzung.tokenHash, s.tokenHash)).get() }).toEqual(vorher);
    expect(aktiverEchterRechner(db)?.id).toBe(alt.antwort.rechnerId);
  });

  it("mit ersetzen: der alte wird widerrufen, der neue angelegt", async () => {
    const db = await mitEchtemPaar();
    const alt = await richteEin(db, sitzungFuer(db, { art: "echt", name: "Einsatzleitung", ersetzen: false }), { art: "echt", name: "Einsatzleitung" }, { jetzt: JETZT, env });
    if (!alt.ok) throw new Error(alt.code);
    const spaeter = new Date(JETZT.getTime() + 3_600_000);
    const neu = await richteEin(db, sitzungFuer(db, { art: "echt", name: "Ersatzrechner", ersetzen: true }), { art: "echt", name: "Ersatzrechner" }, { jetzt: spaeter, env });
    if (!neu.ok) throw new Error(neu.code);
    expect(db.select().from(rechner).where(eq(rechner.id, alt.antwort.rechnerId)).get()?.widerrufenAm).toEqual(spaeter);
    expect(aktiverEchterRechner(db)?.id).toBe(neu.antwort.rechnerId);
    expect(neu.antwort.schluesselId).toBe(alt.antwort.schluesselId);
  });

  it("ersetzen läuft in einer Transaktion: scheitert ein späterer Schritt, bleibt der alte Rechner aktiv und kein neuer entsteht", async () => {
    const db = await mitEchtemPaar();
    const alt = await richteEin(db, sitzungFuer(db, { art: "echt", name: "Einsatzleitung", ersetzen: false }), { art: "echt", name: "Einsatzleitung" }, { jetzt: JETZT, env });
    if (!alt.ok) throw new Error(alt.code);
    const s = sitzungFuer(db, { art: "echt", name: "Ersatzrechner", ersetzen: true });
    const vorher = db.select().from(rechner).all();
    db.run(sql`CREATE TRIGGER test_sitzung_sperre BEFORE UPDATE ON sitzung BEGIN SELECT RAISE(ABORT, 'Testsperre'); END`);
    await expect(richteEin(db, s, { art: "echt", name: "Ersatzrechner" }, { jetzt: JETZT, env })).rejects.toThrow("Testsperre");
    expect(db.select().from(rechner).all()).toEqual(vorher);
    expect(aktiverEchterRechner(db)?.id).toBe(alt.antwort.rechnerId);
  });

  it("ohne echtes Paar: 503 kein_echtes_paar", async () => {
    const db = testDb();
    const s = sitzungFuer(db, { art: "echt", name: "Einsatzleitung", ersetzen: false });
    expect(await richteEin(db, s, { art: "echt", name: "Einsatzleitung" }, { jetzt: JETZT, env })).toMatchObject({ ok: false, status: 503, code: "kein_echtes_paar" });
    expect(zaehle(db)).toEqual({ rechner: 0, paare: 0 });
  });
});

describe("richteEin — Ablehnungen", () => {
  it("Art oder Name weichen von der Sitzung ab: 409 einrichtung_passt_nicht", async () => {
    const db = await mitEchtemPaar();
    const s = sitzungFuer(db, { art: "test", name: "Übungsrechner", ersetzen: false });
    expect(await richteEin(db, s, { art: "echt", name: "Übungsrechner" }, { jetzt: JETZT, env })).toMatchObject({ ok: false, status: 409, code: "einrichtung_passt_nicht" });
    expect(await richteEin(db, s, { art: "test", name: "Anderer Rechner" }, { jetzt: JETZT, env })).toMatchObject({ ok: false, status: 409, code: "einrichtung_passt_nicht" });
    expect(zaehle(db)).toEqual({ rechner: 0, paare: 1 });
  });

  it("Sitzung ohne Einrichtungsart: 409 einrichtung_passt_nicht", async () => {
    const db = await mitEchtemPaar();
    const s = sitzungFuer(db, null);
    expect(await richteEin(db, s, { art: "test", name: "Übungsrechner" }, { jetzt: JETZT, env })).toMatchObject({ ok: false, status: 409, code: "einrichtung_passt_nicht" });
  });

  it("ohne KEK: 503 kek_fehlt; mit kaputtem KEK: 503 kek_ungueltig", async () => {
    const db = await mitEchtemPaar();
    const s = sitzungFuer(db, { art: "test", name: "Übungsrechner", ersetzen: false });
    expect(await richteEin(db, s, { art: "test", name: "Übungsrechner" }, { jetzt: JETZT, env: {} })).toMatchObject({ ok: false, status: 503, code: "kek_fehlt" });
    expect(await richteEin(db, s, { art: "test", name: "Übungsrechner" }, { jetzt: JETZT, env: { EINSATZBUCH_SCHLUESSEL_KEK: "kurz" } })).toMatchObject({ ok: false, status: 503, code: "kek_ungueltig" });
    expect(zaehle(db)).toEqual({ rechner: 0, paare: 1 });
  });

  it("Stammdaten über der Reader-Grenze: 422 stammdaten_zu_lang mit genau feld und eintrag als Zusatz", async () => {
    const db = await mitEchtemPaar();
    db.insert(fahrzeug).values({ id: "fz-lang", typ: "T".repeat(41), kennung: "11-83-1", ruf: "R", standort: "Uelzen" }).run();
    const s = sitzungFuer(db, { art: "test", name: "Übungsrechner", ersetzen: false });
    const e = await richteEin(db, s, { art: "test", name: "Übungsrechner" }, { jetzt: JETZT, env });
    expect(e).toEqual({ ok: false, status: 422, code: "stammdaten_zu_lang", message: expect.stringContaining("41"), extra: { feld: "Fahrzeugtyp", eintrag: "fz-lang" } });
    expect(zaehle(db)).toEqual({ rechner: 0, paare: 1 });
  });
});

describe("richteEin — Wettlauf", () => {
  it("zweimal parallel mit derselben Sitzung: genau ein ok, ein 409 schon_eingerichtet, genau ein neuer Rechner mit einem Paar", async () => {
    const db = await mitEchtemPaar();
    const vorher = zaehle(db);
    const s = sitzungFuer(db, { art: "test", name: "Übungsrechner", ersetzen: false });
    const ergebnisse = await Promise.all([
      richteEin(db, s, { art: "test", name: "Übungsrechner" }, { jetzt: JETZT, env }),
      richteEin(db, s, { art: "test", name: "Übungsrechner" }, { jetzt: JETZT, env }),
    ]);
    const ok = ergebnisse.filter((e) => e.ok);
    expect(ok).toHaveLength(1);
    expect(ergebnisse.filter((e) => !e.ok)).toEqual([expect.objectContaining({ ok: false, status: 409, code: "schon_eingerichtet" })]);
    expect(zaehle(db)).toEqual({ rechner: vorher.rechner + 1, paare: vorher.paare + 1 });
    const neu = ok[0].ok ? ok[0].antwort.rechnerId : "";
    expect(db.select().from(schluesselpaar).where(eq(schluesselpaar.rechnerId, neu)).all()).toHaveLength(1);
    expect(db.select().from(sitzung).where(eq(sitzung.tokenHash, s.tokenHash)).get()).toMatchObject({ rechnerId: neu, eingerichtet: true });
  });

  it("zwei echte Einrichtungen aus zwei Sitzungen ohne ersetzen parallel: ein ok, ein 409 echt_vorhanden, genau ein aktiver echter Rechner", async () => {
    const db = await mitEchtemPaar();
    const s1 = sitzungFuer(db, { art: "echt", name: "Einsatzleitung", ersetzen: false }, { sub: "sub-1" });
    const s2 = sitzungFuer(db, { art: "echt", name: "Einsatzleitung", ersetzen: false }, { sub: "sub-2", name: "Kai Brandt" });
    const ergebnisse = await Promise.all([
      richteEin(db, s1, { art: "echt", name: "Einsatzleitung" }, { jetzt: JETZT, env }),
      richteEin(db, s2, { art: "echt", name: "Einsatzleitung" }, { jetzt: JETZT, env }),
    ]);
    expect(ergebnisse.filter((e) => e.ok)).toHaveLength(1);
    expect(ergebnisse.filter((e) => !e.ok)).toEqual([expect.objectContaining({ ok: false, status: 409, code: "echt_vorhanden" })]);
    const aktiv = db.select().from(rechner).where(and(eq(rechner.art, "echt"), sql`widerrufen_am IS NULL`)).all();
    expect(aktiv).toHaveLength(1);
    expect(db.select().from(rechner).all()).toHaveLength(1);
  });
});

describe("aktiverEchterRechner / widerrufe / loescheTestRechner", () => {
  it("widerrufe setzt widerrufen_am einmal; ein zweiter Widerruf und eine unbekannte ID liefern false", async () => {
    const db = await mitEchtemPaar();
    const e = await richteEin(db, sitzungFuer(db, { art: "echt", name: "Einsatzleitung", ersetzen: false }), { art: "echt", name: "Einsatzleitung" }, { jetzt: JETZT, env });
    if (!e.ok) throw new Error(e.code);
    expect(widerrufe(db, e.antwort.rechnerId, JETZT)).toBe(true);
    expect(aktiverEchterRechner(db)).toBeNull();
    expect(widerrufe(db, e.antwort.rechnerId, new Date(JETZT.getTime() + 1_000))).toBe(false);
    expect(db.select().from(rechner).get()?.widerrufenAm).toEqual(JETZT);
    expect(widerrufe(db, "gibt-es-nicht", JETZT)).toBe(false);
  });

  it("loescheTestRechner: echt → nur_test, unbekannt → unbekannt, Test-Rechner → geloescht samt Paar, Ankern und Sitzungen", async () => {
    const db = await mitEchtemPaar();
    const echt = await richteEin(db, sitzungFuer(db, { art: "echt", name: "Einsatzleitung", ersetzen: false }), { art: "echt", name: "Einsatzleitung" }, { jetzt: JETZT, env });
    const test = await richteEin(db, sitzungFuer(db, { art: "test", name: "Übungsrechner", ersetzen: false }), { art: "test", name: "Übungsrechner" }, { jetzt: JETZT, env });
    if (!echt.ok || !test.ok) throw new Error("Einrichtung fehlgeschlagen");
    db.insert(anker).values({ rechnerId: test.antwort.rechnerId, block: 1, hash: "1".repeat(64), gemeldetAm: JETZT }).run();

    expect(loescheTestRechner(db, echt.antwort.rechnerId)).toBe("nur_test");
    expect(loescheTestRechner(db, "gibt-es-nicht")).toBe("unbekannt");
    expect(loescheTestRechner(db, test.antwort.rechnerId)).toBe("geloescht");
    expect(db.select().from(rechner).all().map((r) => r.id)).toEqual([echt.antwort.rechnerId]);
    expect(db.select().from(schluesselpaar).where(eq(schluesselpaar.art, "test")).all()).toEqual([]);
    expect(db.select().from(anker).all()).toEqual([]);
    expect(db.select().from(sitzung).where(and(eq(sitzung.rechnerId, test.antwort.rechnerId))).all()).toEqual([]);
    expect(loescheTestRechner(db, test.antwort.rechnerId)).toBe("unbekannt");
  });
});
