import { afterEach, describe, expect, it, vi } from "vitest";
import { meldung } from "../_db/schema";
import { alsVertrag } from "./konfiguration";
import { aktiveMeldungen, beendeMeldung, legeMeldungAn, MELDUNGEN_MAX_AKTIV, meldungEingabe, naechsteUhrzeit } from "./meldungen";
import { testDb } from "./testDb";

const JETZT = new Date("2026-10-27T12:00:00Z"); // 13:00 in Berlin
const eingabe = (e: Record<string, unknown>) => meldungEingabe.parse({ text: "Nächste Lagebesprechung", ...e });

describe("Meldungen am Lagemonitor", () => {
  afterEach(() => vi.useRealTimers());

  it("läuft ohne Angabe nach 24 Stunden ab und hat keinen Countdown", () => {
    const db = testDb();
    const r = legeMeldungAn(db, eingabe({}), "Ruben", JETZT);
    expect(r).toMatchObject({ ok: true, meldung: { text: "Nächste Lagebesprechung", zeitpunkt: null, ablaufAm: "2026-10-28T12:00:00.000Z", angelegtVon: "Ruben" } });
  });

  it("ohne Ablauf geht es nicht: nur die angebotenen Laufzeiten", () => {
    expect(meldungEingabe.safeParse({ text: "x", laufzeitStunden: 0 }).success).toBe(false);
    expect(meldungEingabe.safeParse({ text: "x", laufzeitStunden: 10_000 }).success).toBe(false);
    expect(meldungEingabe.safeParse({ text: "x", laufzeitStunden: 4 }).success).toBe(true);
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
    // `alsVertrag` filtert nach der echten Uhr; ohne sie festzuhalten, war die Meldung ab dem
    // 28.10.2026, 12:00 UTC schon abgelaufen.
    vi.useFakeTimers({ now: JETZT, toFake: ["Date"] });
    const db = testDb();
    const r = legeMeldungAn(db, eingabe({ uhrzeit: "14:30" }), "Ruben", JETZT);
    if (!r.ok) throw new Error(r.fehler);
    expect(alsVertrag(db).notices).toEqual([
      { id: r.meldung.id, text: "Nächste Lagebesprechung", countdownTo: "2026-10-27T13:30:00.000Z", expiresAt: r.meldung.ablaufAm },
    ]);
    expect(beendeMeldung(db, r.meldung.id)).toBe(true);
    expect(beendeMeldung(db, r.meldung.id)).toBe(false);
    expect(alsVertrag(db).notices).toEqual([]);
    expect(db.select().from(meldung).all()).toHaveLength(1);
  });

  it("abgelaufene Meldungen gehen nicht mehr raus, und es laufen höchstens drei", () => {
    const db = testDb();
    legeMeldungAn(db, eingabe({ laufzeitStunden: 1 }), "Ruben", JETZT);
    const spaeter = new Date(JETZT.getTime() + 3_600_000);
    expect(aktiveMeldungen(db, spaeter)).toEqual([]);
    for (let i = 0; i < MELDUNGEN_MAX_AKTIV; i++) expect(legeMeldungAn(db, eingabe({ text: `Meldung ${i}` }), "Ruben", new Date(spaeter.getTime() + i * 1000)).ok).toBe(true);
    expect(legeMeldungAn(db, eingabe({}), "Ruben", spaeter)).toMatchObject({ ok: false });
    expect(aktiveMeldungen(db, spaeter).map((m) => m.text)).toEqual(["Meldung 0", "Meldung 1", "Meldung 2"]);
  });
});
