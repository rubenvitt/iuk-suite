import { describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { plan, planFreigabe } from "../_db/schema";
import { FREIGABE_GRENZE } from "./freigabe/regeln";
import { freigabenFuer, loeseToken, neuesToken, qrTokenFuer, stelleFreigabeAus, widerrufeFreigabe, zaehleAbruf } from "./freigaben";
import { archiviere, PLAN_WEG, stelleWiederHer } from "./planverwaltung";
import { seedLokalKommplan } from "./seedLokal";
import { testDb } from "./testDb";

const WER = { nutzer: "u1", name: "Jana" };
const JETZT = Date.UTC(2026, 9, 1, 18, 0);
const STUNDE = 3_600_000;
const OPENR = "beispiel-openr-2022-07-01";
const EINSATZ = "beispiel-einsatz-2026-02-22";
async function mitSeed() { const db = testDb(); await seedLokalKommplan(db); return db; }
const audit = (db: ReturnType<typeof testDb>) =>
  db.all(sql`SELECT action FROM audit_outbox WHERE object_type = 'plan_freigabe' ORDER BY rowid`) as { action: string }[];
function aus(db: ReturnType<typeof testDb>, planId = OPENR, dauer = "7d", notiz = "Leitstelle", jetzt = JETZT) {
  const r = stelleFreigabeAus(db, { planId, dauer, notiz }, WER, jetzt);
  if (!r.ok) throw new Error(r.fehler);
  return r.freigaben.find((f) => f.id === r.neu)!;
}

describe("Ausstellen (Spec §8.2; Entscheidungen 1–3)", () => {
  it("legt einen gültigen Link mit 43-Zeichen-Token, Notiz und Ablauf an — eine Audit-Zeile", async () => {
    const db = await mitSeed();
    const f = aus(db);
    expect(f.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(f).toMatchObject({ notiz: "Leitstelle", ablauf: JETZT + 7 * 24 * STUNDE, widerrufenAm: null, erstelltAm: JETZT, erstelltVon: "Jana", abrufe: 0, zuletztAbgerufen: null, status: "gueltig" });
    expect(audit(db)).toEqual([{ action: "create" }]);
  });
  it("leere Notiz wird null, unbegrenzt hat keinen Ablauf", async () => {
    const db = await mitSeed();
    expect(aus(db, OPENR, "unbegrenzt", "   ")).toMatchObject({ notiz: null, ablauf: null });
  });
  it("Tokens sind verschieden", () => {
    const viele = new Set(Array.from({ length: 200 }, neuesToken));
    expect(viele.size).toBe(200);
  });
  it("unbekannter oder archivierter Plan: abgewiesen; ungültige Eingabe: Feldfehler", async () => {
    const db = await mitSeed();
    expect(stelleFreigabeAus(db, { planId: "gibt-es-nicht", dauer: "7d", notiz: "" }, WER, JETZT)).toEqual({ ok: false, fehler: PLAN_WEG, feldFehler: {} });
    archiviere(db, EINSATZ, JETZT);
    expect(stelleFreigabeAus(db, { planId: EINSATZ, dauer: "7d", notiz: "" }, WER, JETZT)).toMatchObject({ ok: false, fehler: PLAN_WEG });
    const r = stelleFreigabeAus(db, { planId: OPENR, dauer: "7d", notiz: "x".repeat(FREIGABE_GRENZE.notiz + 1) }, WER, JETZT);
    expect(r).toMatchObject({ ok: false, feldFehler: { notiz: expect.any(String) } });
  });
  it("höchstens 20 gültige Links je Plan; abgelaufene und widerrufene zählen nicht", async () => {
    const db = await mitSeed();
    const erster = aus(db, OPENR, "24h", "", JETZT - 48 * STUNDE); // längst abgelaufen
    for (let i = 0; i < FREIGABE_GRENZE.gueltigJePlan; i++) aus(db);
    expect(stelleFreigabeAus(db, { planId: OPENR, dauer: "7d", notiz: "" }, WER, JETZT)).toMatchObject({ ok: false, fehler: expect.stringContaining("Höchstens 20") });
    const einer = freigabenFuer(db, OPENR, JETZT).find((f) => f.status === "gueltig")!;
    expect(widerrufeFreigabe(db, { planId: OPENR, freigabeId: einer.id }, JETZT).ok).toBe(true);
    expect(stelleFreigabeAus(db, { planId: OPENR, dauer: "7d", notiz: "" }, WER, JETZT).ok).toBe(true);
    expect(freigabenFuer(db, OPENR, JETZT).find((f) => f.id === erster.id)?.status).toBe("abgelaufen");
  });
});

describe("Liste", () => {
  it("gültige zuerst, je Gruppe die neuesten oben; nur die Links DIESES Plans", async () => {
    const db = await mitSeed();
    const alt = aus(db, OPENR, "7d", "alt", JETZT - 2);
    const weg = aus(db, OPENR, "7d", "weg", JETZT - 1);
    const neu = aus(db, OPENR, "7d", "neu", JETZT);
    aus(db, EINSATZ);
    widerrufeFreigabe(db, { planId: OPENR, freigabeId: weg.id }, JETZT);
    expect(freigabenFuer(db, OPENR, JETZT).map((f) => [f.notiz, f.status])).toEqual([["neu", "gueltig"], ["alt", "gueltig"], ["weg", "widerrufen"]]);
    expect(alt.status).toBe("gueltig");
    expect(neu.status).toBe("gueltig");
  });
});

describe("Widerrufen (IDOR)", () => {
  it("nur über (Link, Plan); ein fremder Plan widerruft nichts und erfährt nichts", async () => {
    const db = await mitSeed();
    const f = aus(db);
    expect(widerrufeFreigabe(db, { planId: EINSATZ, freigabeId: f.id }, JETZT)).toEqual({ ok: false, fehler: "Diesen Link gibt es nicht.", feldFehler: {} });
    expect(freigabenFuer(db, OPENR, JETZT)[0].status).toBe("gueltig");
    const r = widerrufeFreigabe(db, { planId: OPENR, freigabeId: f.id }, JETZT + 1);
    expect(r).toMatchObject({ ok: true, neu: null });
    if (r.ok) expect(r.freigaben[0]).toMatchObject({ status: "widerrufen", widerrufenAm: JETZT + 1 });
    expect(audit(db)).toEqual([{ action: "create" }, { action: "update" }]);
    // noch einmal: kein zweites Audit, der Zeitpunkt bleibt
    expect(widerrufeFreigabe(db, { planId: OPENR, freigabeId: f.id }, JETZT + 9).ok).toBe(true);
    expect(freigabenFuer(db, OPENR, JETZT)[0].widerrufenAm).toBe(JETZT + 1);
    expect(audit(db)).toHaveLength(2);
  });
});

describe("Auflösen (Spec §8.2: unbekannt, abgelaufen, widerrufen, archiviert → nichts)", () => {
  it("gültig → der lesbare Plan; alles andere → null", async () => {
    const db = await mitSeed();
    const f = aus(db, OPENR, "24h");
    expect(loeseToken(db, f.token, JETZT)?.plan).toMatchObject({ id: OPENR, archiviertAm: null });
    expect(loeseToken(db, f.token, JETZT + 24 * STUNDE)).toBeNull(); // genau an der Grenze
    expect(loeseToken(db, "A".repeat(43), JETZT)).toBeNull();
    expect(loeseToken(db, `${f.token}x`, JETZT)).toBeNull();
    expect(loeseToken(db, f.token.toLowerCase() === f.token ? f.token.toUpperCase() : f.token.toLowerCase(), JETZT)).toBeNull();
    const g = aus(db, OPENR, "unbegrenzt");
    widerrufeFreigabe(db, { planId: OPENR, freigabeId: g.id }, JETZT);
    expect(loeseToken(db, g.token, JETZT)).toBeNull();
    const h = aus(db, EINSATZ, "unbegrenzt");
    // Archiv OHNE Widerruf (direkt in der Spalte): `archiviere` widerruft die Links selbst (Entscheidung 3) — dann
    // prüfte dieser Fall nur den Widerruf, und die Archiv-Bedingung in `loeseToken` (doppelter Boden) bliebe ungetestet.
    db.update(plan).set({ archiviertAm: new Date(JETZT) }).where(eq(plan.id, EINSATZ)).run();
    expect(freigabenFuer(db, EINSATZ, JETZT).find((f) => f.id === h.id)?.status).toBe("gueltig");
    expect(loeseToken(db, h.token, JETZT)).toBeNull();
  });
  it("falsche Form fragt die Datenbank gar nicht erst (kein Wurf bei SQL-artigem Text)", async () => {
    const db = await mitSeed();
    let abfragen = 0;
    // Methoden an der echten Datenbank gebunden (drizzle braucht `this`); gezählt wird jede Abfrage.
    const gezaehlt = new Proxy(db, {
      get(ziel, name) {
        const wert = Reflect.get(ziel, name, ziel) as unknown;
        return typeof wert === "function" ? (...a: unknown[]) => { abfragen++; return (wert as (...x: unknown[]) => unknown).apply(ziel, a); } : wert;
      },
    });
    for (const t of ["' OR 1=1 --", "", "A".repeat(42), `${"A".repeat(43)}=`]) expect(loeseToken(gezaehlt, t, JETZT)).toBeNull();
    expect(abfragen).toBe(0);
    expect(loeseToken(gezaehlt, "A".repeat(43), JETZT)).toBeNull(); // richtige Form: erst DANN fragt sie
    expect(abfragen).toBeGreaterThan(0);
  });
});

describe("Archivieren widerruft (Entscheidung 3, Review Focus 7)", () => {
  it("gültige Links werden widerrufen — je eine Audit-Zeile; widerrufene behalten ihren Zeitpunkt, abgelaufene bleiben abgelaufen; Wiederherstellen erweckt keinen", async () => {
    const db = await mitSeed();
    const a = aus(db, EINSATZ, "unbegrenzt", "a");
    const b = aus(db, EINSATZ, "7d", "b");
    const alt = aus(db, EINSATZ, "24h", "alt", JETZT - 48 * STUNDE);
    const weg = aus(db, EINSATZ, "7d", "weg");
    widerrufeFreigabe(db, { planId: EINSATZ, freigabeId: weg.id }, JETZT - 5);
    const andere = aus(db, OPENR, "unbegrenzt", "anderer Plan");
    const vorher = audit(db).length;
    expect(archiviere(db, EINSATZ, JETZT)).toEqual({ ok: true });
    const nach = new Map(freigabenFuer(db, EINSATZ, JETZT).map((f) => [f.id, f]));
    expect(nach.get(a.id)).toMatchObject({ status: "widerrufen", widerrufenAm: JETZT });
    expect(nach.get(b.id)).toMatchObject({ status: "widerrufen", widerrufenAm: JETZT });
    expect(nach.get(weg.id)?.widerrufenAm).toBe(JETZT - 5);
    expect(nach.get(alt.id)).toMatchObject({ status: "abgelaufen", widerrufenAm: null });
    expect(audit(db).slice(vorher)).toEqual([{ action: "update" }, { action: "update" }]);
    expect(loeseToken(db, andere.token, JETZT)).not.toBeNull(); // nur DIESER Plan
    expect(stelleWiederHer(db, EINSATZ)).toEqual({ ok: true });
    expect(loeseToken(db, a.token, JETZT + 1)).toBeNull();
    expect(qrTokenFuer(db, EINSATZ, JETZT + 1)).toBeNull();
  });
});

describe("Zählen (Entscheidung 6)", () => {
  it("zählt hoch und setzt zuletzt abgerufen — ohne Audit-Zeile", async () => {
    const db = await mitSeed();
    const f = aus(db);
    const vorher = audit(db).length;
    zaehleAbruf(db, f.id, JETZT + 5);
    zaehleAbruf(db, f.id, JETZT + 9);
    expect(db.select().from(planFreigabe).where(eq(planFreigabe.id, f.id)).get()).toMatchObject({ abrufe: 2, zuletztAbgerufen: new Date(JETZT + 9) });
    expect(audit(db)).toHaveLength(vorher);
  });
  it("zählt NUR den abgerufenen Link — andere Links desselben und eines anderen Plans bleiben unberührt", async () => {
    const db = await mitSeed();
    const f = aus(db);
    const nachbar = aus(db, OPENR, "unbegrenzt");
    const fremd = aus(db, EINSATZ);
    zaehleAbruf(db, f.id, JETZT + 5);
    for (const z of [nachbar, fremd]) {
      expect(db.select().from(planFreigabe).where(eq(planFreigabe.id, z.id)).get()).toMatchObject({ abrufe: 0, zuletztAbgerufen: null });
    }
  });
});

describe("QR des internen Drucks", () => {
  it("nimmt den besten gültigen Link des Plans, sonst null", async () => {
    const db = await mitSeed();
    expect(qrTokenFuer(db, OPENR, JETZT)).toBeNull();
    aus(db, OPENR, "24h");
    const unbegrenzt = aus(db, OPENR, "unbegrenzt", "", JETZT - 10);
    aus(db, OPENR, "30d");
    expect(qrTokenFuer(db, OPENR, JETZT)).toBe(unbegrenzt.token);
    widerrufeFreigabe(db, { planId: OPENR, freigabeId: unbegrenzt.id }, JETZT);
    expect(qrTokenFuer(db, OPENR, JETZT)).not.toBe(unbegrenzt.token);
  });
});
