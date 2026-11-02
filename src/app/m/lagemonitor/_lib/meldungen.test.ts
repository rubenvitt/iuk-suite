import { describe, expect, it, onTestFinished, vi } from "vitest";
import { meldung } from "../_db/schema";
import { alsVertrag } from "./konfiguration";
import { aktiveMeldungen, beendeMeldung, legeMeldungAn, MELDUNGEN_MAX_AKTIV, MELDUNGEN_MAX_GEPLANT, meldungEingabe, naechsteUhrzeit, offeneMeldungen } from "./meldungen";
import { letzteUhrzeitBis, planeMeldung } from "./meldungRegeln";
import { testDb } from "./testDb";

const JETZT = new Date("2026-10-27T12:00:00Z"); // 13:00 in Berlin
const eingabe = (e: Record<string, unknown>) => meldungEingabe.parse({ text: "Nächste Lagebesprechung", ...e });

describe("Meldungen am Lagemonitor", () => {
  it("läuft ohne Angabe nach 24 Stunden ab und hat keinen Countdown", () => {
    const db = testDb();
    const r = legeMeldungAn(db, eingabe({}), "Ruben", JETZT);
    expect(r).toMatchObject({ ok: true, meldung: { text: "Nächste Lagebesprechung", zeitpunkt: null, ablaufAm: "2026-10-28T12:00:00.000Z", angelegtVon: "Ruben" } });
  });

  it("ohne Ablauf geht es nicht: nur die angebotenen Laufzeiten", () => {
    expect(meldungEingabe.safeParse({ text: "x", laufzeitMinuten: 0 }).success).toBe(false);
    expect(meldungEingabe.safeParse({ text: "x", laufzeitMinuten: 7 }).success).toBe(false);
    expect(meldungEingabe.safeParse({ text: "x", laufzeitMinuten: 10_080 * 2 }).success).toBe(false);
    expect(meldungEingabe.safeParse({ text: "x", laufzeitMinuten: 10 }).success).toBe(true);
    expect(meldungEingabe.safeParse({ text: "x", laufzeitMinuten: 90 }).success).toBe(true);
    expect(meldungEingabe.safeParse({ text: "x", anzeigenAb: "24:00" }).success).toBe(false);
    expect(meldungEingabe.safeParse({ text: "   " }).success).toBe(false);
    expect(meldungEingabe.safeParse({ text: "x".repeat(81) }).success).toBe(false);
    expect(meldungEingabe.safeParse({ text: "x", uhrzeit: "25:00" }).success).toBe(false);
  });

  it("zählt bis zur nächsten Uhrzeit in der Suite-Zone, auch über die Zeitumstellung", () => {
    expect(naechsteUhrzeit("14:30", JETZT).toISOString()).toBe("2026-10-27T13:30:00.000Z");
    expect(naechsteUhrzeit("12:00", JETZT).toISOString()).toBe("2026-10-28T11:00:00.000Z");
    // 28.03.2026, 23:00 MEZ; am nächsten Morgen gilt schon Sommerzeit.
    expect(naechsteUhrzeit("10:00", new Date("2026-03-28T22:00:00Z")).toISOString()).toBe("2026-03-29T08:00:00.000Z");
    // Am Tag der Umstellung selbst: 25.10.2026, nach 03:00 wieder MEZ.
    expect(naechsteUhrzeit("09:00", new Date("2026-10-24T23:30:00Z")).toISOString()).toBe("2026-10-25T08:00:00.000Z");
  });

  it("Beenden nimmt die Meldung sofort vom Monitor, die Zeile bleibt", () => {
    // `alsVertrag` fragt die Uhr selbst; ohne gestellte Uhr wäre die Meldung ab JETZT + 24 h abgelaufen.
    vi.useFakeTimers({ toFake: ["Date"], now: JETZT });
    onTestFinished(() => { vi.useRealTimers(); });
    const db = testDb();
    const r = legeMeldungAn(db, eingabe({ uhrzeit: "14:30" }), "Ruben", JETZT);
    if (!r.ok) throw new Error(r.fehler);
    expect(alsVertrag(db, JETZT).notices).toEqual([
      { id: r.meldung.id, text: "Nächste Lagebesprechung", countdownTo: "2026-10-27T13:30:00.000Z", expiresAt: r.meldung.ablaufAm, showFrom: null, category: null },
    ]);
    expect(beendeMeldung(db, r.meldung.id, JETZT)).toBe(true);
    expect(beendeMeldung(db, r.meldung.id, JETZT)).toBe(false);
    expect(alsVertrag(db, JETZT).notices).toEqual([]);
    expect(db.select().from(meldung).all()).toHaveLength(1);
  });

  it("die Plätze am Monitor bekommen die zuerst fälligen, nicht die zuerst angelegten", () => {
    vi.useFakeTimers({ toFake: ["Date"], now: JETZT });
    onTestFinished(() => { vi.useRealTimers(); });
    const db = testDb();
    // 13:00 Berlin. Angelegt in dieser Reihenfolge, „Fünf“ zuletzt, aber am frühesten fällig.
    const plan: [string, string][] = [["Eins", "17:00"], ["Zwei", "23:00"], ["Drei", "19:00"], ["Vier", "23:30"], ["Fünf", "15:00"]];
    plan.forEach(([text, uhrzeit], i) => expect(legeMeldungAn(db, eingabe({ text, uhrzeit }), "Ruben", new Date(JETZT.getTime() + i * 1000)).ok).toBe(true));
    const danach = new Date(JETZT.getTime() + 10_000);
    expect(aktiveMeldungen(db, danach).map((m) => m.text)).toEqual(["Fünf", "Eins", "Drei"]);
    // Der Monitor nimmt die ersten drei in dieser Reihenfolge.
    expect(alsVertrag(db, danach).notices.map((n) => n.text)).toEqual(["Fünf", "Eins", "Drei", "Zwei", "Vier"]);
    // Ohne Countdown zählt der Beginn: jetzt angelegt, also jetzt fällig, vor allem, was erst später fällig wird.
    expect(legeMeldungAn(db, eingabe({ text: "Funkkanal" }), "Ruben", danach)).toMatchObject({ ok: true, wartet: false });
    expect(aktiveMeldungen(db, danach).map((m) => m.text)).toEqual(["Funkkanal", "Fünf", "Eins"]);
  });

  it("abgelaufene Meldungen gehen nicht mehr raus, am Monitor stehen höchstens drei, die anderen warten", () => {
    vi.useFakeTimers({ toFake: ["Date"], now: JETZT });
    onTestFinished(() => { vi.useRealTimers(); });
    const db = testDb();
    legeMeldungAn(db, eingabe({ laufzeitMinuten: 60 }), "Ruben", JETZT);
    const spaeter = new Date(JETZT.getTime() + 3_600_000);
    expect(offeneMeldungen(db, spaeter)).toEqual([]);
    for (let i = 0; i < MELDUNGEN_MAX_AKTIV + 1; i++) expect(legeMeldungAn(db, eingabe({ text: `Meldung ${i}` }), "Ruben", new Date(spaeter.getTime() + i * 1000)).ok).toBe(true);
    const danach = new Date(spaeter.getTime() + 10_000);
    expect(aktiveMeldungen(db, danach).map((m) => m.text)).toEqual(["Meldung 0", "Meldung 1", "Meldung 2"]);
    // Die wartende geht mit, damit der Monitor sie auch ohne Suite nachrücken lässt; er zeigt die ersten drei.
    expect(alsVertrag(db, danach).notices.map((n) => n.text)).toEqual(["Meldung 0", "Meldung 1", "Meldung 2", "Meldung 3"]);
    expect(offeneMeldungen(db, danach)).toHaveLength(4);
    // Wird ein Platz frei, rückt die wartende nach.
    expect(beendeMeldung(db, offeneMeldungen(db, danach)[1].id, danach)).toBe(true);
    expect(aktiveMeldungen(db, danach).map((m) => m.text)).toEqual(["Meldung 0", "Meldung 2", "Meldung 3"]);
  });

  it("planbar sind viele, aber nicht unbegrenzt", () => {
    const db = testDb();
    for (let i = 0; i < MELDUNGEN_MAX_GEPLANT; i++) expect(legeMeldungAn(db, eingabe({ text: `M ${i}`, anzeigenAb: "20:00" }), "Ruben", JETZT).ok).toBe(true);
    expect(legeMeldungAn(db, eingabe({}), "Ruben", JETZT)).toMatchObject({ ok: false });
  });

  it("„Anzeigen ab“: geplant erst später am Monitor, die Laufzeit zählt ab dann", () => {
    const db = testDb();
    const r = legeMeldungAn(db, eingabe({ anzeigenAb: "15:00", laufzeitMinuten: 30 }), "Ruben", JETZT);
    if (!r.ok) throw new Error(r.fehler);
    expect(r.meldung).toMatchObject({ anzeigenAb: "2026-10-27T14:00:00.000Z", ablaufAm: "2026-10-27T14:30:00.000Z" });
    expect(aktiveMeldungen(db, new Date("2026-10-27T13:59:59Z"))).toEqual([]);
    expect(offeneMeldungen(db, new Date("2026-10-27T13:59:59Z"))).toHaveLength(1);
    expect(aktiveMeldungen(db, new Date("2026-10-27T14:00:00Z"))).toHaveLength(1);
    expect(aktiveMeldungen(db, new Date("2026-10-27T14:30:00Z"))).toEqual([]);
  });

  it("der Monitor holt eine geplante Meldung fünf Minuten vorher ab, mit ihrem Beginn", () => {
    vi.useFakeTimers({ toFake: ["Date"], now: JETZT });
    onTestFinished(() => { vi.useRealTimers(); });
    const db = testDb();
    const r = legeMeldungAn(db, eingabe({ anzeigenAb: "15:00", laufzeitMinuten: 30 }), "Ruben", JETZT);
    if (!r.ok) throw new Error(r.fehler);
    expect(alsVertrag(db, new Date("2026-10-27T13:54:59Z")).notices).toEqual([]);
    expect(alsVertrag(db, new Date("2026-10-27T13:55:00Z")).notices).toEqual([expect.objectContaining({ id: r.meldung.id, showFrom: "2026-10-27T14:00:00.000Z", expiresAt: "2026-10-27T14:30:00.000Z" })]);
  });

  it("mit Countdown liegt „Anzeigen ab“ vor der Uhrzeit; ist sie schon vorbei, sofort", () => {
    const e = { laufzeitMinuten: 1440 };
    // 13:00 Berlin: Besprechung 14:30, anzeigen ab 14:00 heute.
    expect(planeMeldung({ ...e, uhrzeit: "14:30", anzeigenAb: "14:00" }, JETZT)).toMatchObject({ zeitpunkt: new Date("2026-10-27T13:30:00Z"), anzeigenAb: new Date("2026-10-27T13:00:00Z") });
    // Anzeigen ab 12:00 ist vorbei: sofort, die Laufzeit zählt ab jetzt.
    expect(planeMeldung({ ...e, uhrzeit: "14:30", anzeigenAb: "12:00" }, JETZT)).toMatchObject({ anzeigenAb: null, ablaufAm: new Date("2026-10-28T12:00:00Z") });
    // Countdown morgen früh, anzeigen ab 22:00 am Abend davor.
    expect(planeMeldung({ ...e, uhrzeit: "07:00", anzeigenAb: "22:00" }, JETZT).anzeigenAb).toEqual(new Date("2026-10-27T21:00:00Z"));
    expect(letzteUhrzeitBis("14:30", new Date("2026-10-27T13:30:00Z"))).toEqual(new Date("2026-10-27T13:30:00Z"));
  });

  it("„Anzeigen ab“ nach dem Countdown wird abgelehnt, nicht stillschweigend sofort", () => {
    // 13:00 Berlin: Countdown 14:30, anzeigen ab 15:00 meint heute 15:00, nicht gestern.
    expect(planeMeldung({ uhrzeit: "14:30", anzeigenAb: "15:00", laufzeitMinuten: 60 }, JETZT).anzeigenAb).toEqual(new Date("2026-10-27T14:00:00Z"));
    expect(legeMeldungAn(testDb(), eingabe({ uhrzeit: "14:30", anzeigenAb: "15:00" }), "Ruben", JETZT)).toMatchObject({ ok: false });
  });

  it("meldet, ob eine sofortige Meldung auf einen Platz am Monitor wartet", () => {
    const db = testDb();
    for (let i = 0; i < MELDUNGEN_MAX_AKTIV; i++) expect(legeMeldungAn(db, eingabe({ text: `M ${i}` }), "Ruben", JETZT)).toMatchObject({ ok: true, wartet: false });
    expect(legeMeldungAn(db, eingabe({ text: "vierte" }), "Ruben", JETZT)).toMatchObject({ ok: true, wartet: true });
    expect(legeMeldungAn(db, eingabe({ text: "später", anzeigenAb: "20:00" }), "Ruben", JETZT)).toMatchObject({ ok: true, wartet: false });
  });

  it("die Kategorie nimmt eine Meldung nach der Uhrzeit weg, auch eine schon laufende", () => {
    vi.useFakeTimers({ toFake: ["Date"], now: JETZT });
    onTestFinished(() => { vi.useRealTimers(); });
    const db = testDb();
    // „Besprechung“ verschwindet nach der Vorgabe 15 Minuten nach der Uhrzeit.
    const r = legeMeldungAn(db, eingabe({ uhrzeit: "14:30", kategorieId: "besprechung" }), "Ruben", JETZT);
    if (!r.ok) throw new Error(r.fehler);
    expect(alsVertrag(db, JETZT).notices[0].expiresAt).toBe("2026-10-27T13:45:00.000Z");
    expect(aktiveMeldungen(db, new Date("2026-10-27T13:44:59Z"))).toHaveLength(1);
    expect(offeneMeldungen(db, new Date("2026-10-27T13:45:00Z"))).toEqual([]);
    // Ohne Countdown gilt die Laufzeit.
    const ohne = legeMeldungAn(db, eingabe({ kategorieId: "besprechung" }), "Ruben", JETZT);
    if (!ohne.ok) throw new Error(ohne.fehler);
    expect(alsVertrag(db, JETZT).notices.find((n) => n.id === ohne.meldung.id)?.expiresAt).toBe("2026-10-28T12:00:00.000Z");
  });

  it("„Anzeigen ab“ muss vor der Uhrzeit liegen", () => {
    const db = testDb();
    expect(legeMeldungAn(db, eingabe({ uhrzeit: "14:30", anzeigenAb: "14:30" }), "Ruben", JETZT)).toMatchObject({ ok: false });
    expect(legeMeldungAn(db, eingabe({ uhrzeit: "14:30", anzeigenAb: "14:29" }), "Ruben", JETZT)).toMatchObject({ ok: true });
  });
});
