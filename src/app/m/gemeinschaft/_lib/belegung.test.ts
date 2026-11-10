import { describe, expect, it } from "vitest";
import {
  amTag, belegend, harteKonflikte, konflikte, liegtAmTag, monatPlus, monatsRaster, monatsZeitraum, oeffentlicheBelegung, sichtbar,
  sperrenAusEvents, tagesstuecke, vorschlagAmTag, ueberlappt, type Eintrag, type Zustand,
} from "./belegung";
import { zeitpunkt } from "./zeit";

/** Zeitpunkt in der Suite-Zone (Vorgabe Europe/Berlin). */
const um = (tag: string, uhr: string) => zeitpunkt(tag, uhr);

let n = 0;
function e(zustand: Zustand, vonTag: string, vonUhr: string, bisTag: string, bisUhr: string, titel = "x"): Eintrag {
  return { id: `e${++n}`, art: zustand === "gesperrt" ? "sperre" : "anfrage", von: um(vonTag, vonUhr), bis: um(bisTag, bisUhr), titel, zustand, eventId: null };
}

describe("ueberlappt", () => {
  it("halboffene Zeiträume: Ende 22:00 und Beginn 22:00 überschneiden sich nicht", () => {
    const a = { von: um("2026-11-07", "18:00"), bis: um("2026-11-07", "22:00") };
    expect(ueberlappt(a, { von: um("2026-11-07", "22:00"), bis: um("2026-11-07", "23:00") })).toBe(false);
    expect(ueberlappt(a, { von: um("2026-11-07", "21:45"), bis: um("2026-11-07", "23:00") })).toBe(true);
  });

  it("umschließend und umschlossen", () => {
    const lang = { von: um("2026-11-07", "08:00"), bis: um("2026-11-09", "20:00") };
    const kurz = { von: um("2026-11-08", "12:00"), bis: um("2026-11-08", "13:00") };
    expect(ueberlappt(lang, kurz)).toBe(true);
    expect(ueberlappt(kurz, lang)).toBe(true);
  });
});

describe("belegend und sichtbar", () => {
  it("nur Zusagen und Sperrzeiten belegen; offene Anfragen nicht", () => {
    expect(belegend({ zustand: "zugesagt" })).toBe(true);
    expect(belegend({ zustand: "gesperrt" })).toBe(true);
    expect(belegend({ zustand: "angefragt" })).toBe(false);
    expect(belegend({ zustand: "abgelehnt" })).toBe(false);
    expect(belegend({ zustand: "zurueckgezogen" })).toBe(false);
  });

  it("die Leitung sieht auch offene Anfragen, nicht aber Absagen und zurückgezogene", () => {
    expect(sichtbar({ zustand: "angefragt" })).toBe(true);
    expect(sichtbar({ zustand: "abgelehnt" })).toBe(false);
    expect(sichtbar({ zustand: "zurueckgezogen" })).toBe(false);
  });
});

describe("sperrenAusEvents", () => {
  it("ein Event mit „Bar belegen“ wird eine abgeleitete Sperrzeit mit Titel und Event-Kennung", () => {
    const [s] = sperrenAusEvents([{ id: "v1", titel: "Glühweinabend", von: um("2026-11-13", "18:00"), bis: um("2026-11-13", "23:00") }]);
    expect(s).toMatchObject({ id: "ev-v1", art: "sperre", titel: "Event: Glühweinabend", zustand: "gesperrt", eventId: "v1" });
    expect(belegend(s)).toBe(true);
  });

  it("blockiert eine Zusage wie eine eigene Sperrzeit", () => {
    const ev = sperrenAusEvents([{ id: "v1", titel: "Spieleabend", von: um("2026-11-12", "19:00"), bis: um("2026-11-12", "22:00") }]);
    const anfrage = { von: um("2026-11-12", "20:00"), bis: um("2026-11-12", "23:00") };
    expect(harteKonflikte(anfrage, ev).map((x) => x.eventId)).toEqual(["v1"]);
  });
});

describe("harteKonflikte und konflikte", () => {
  const zusage = e("zugesagt", "2026-11-07", "18:00", "2026-11-08", "01:00", "40. Geburtstag");
  const sperre = e("gesperrt", "2026-11-10", "19:00", "2026-11-10", "22:00", "Dienstabend");
  const offen = e("angefragt", "2026-11-07", "20:00", "2026-11-07", "23:00", "Vereinstreffen");
  const offen2 = e("angefragt", "2026-11-07", "19:00", "2026-11-07", "21:00", "Kaffeetrinken");
  const abgelehnt = e("abgelehnt", "2026-11-07", "18:00", "2026-11-07", "20:00");
  const alle = [zusage, sperre, offen, offen2, abgelehnt];

  it("hart sind nur belegende Einträge; die eigene Kennung zählt nicht", () => {
    expect(harteKonflikte(offen, alle).map((x) => x.titel)).toEqual(["40. Geburtstag"]);
    expect(harteKonflikte(zusage, alle, zusage.id)).toEqual([]);
    expect(harteKonflikte({ von: um("2026-11-09", "10:00"), bis: um("2026-11-09", "12:00") }, alle)).toEqual([]);
  });

  it("über Mitternacht: eine Zusage bis 01:00 trifft eine Anfrage ab 00:30 am Folgetag", () => {
    expect(harteKonflikte({ von: um("2026-11-08", "00:30"), bis: um("2026-11-08", "02:00") }, alle)).toHaveLength(1);
    expect(harteKonflikte({ von: um("2026-11-08", "01:00"), bis: um("2026-11-08", "02:00") }, alle)).toHaveLength(0);
  });

  it("weiche Überschneidungen zeigen auch offene Anfragen, nie Absagen", () => {
    expect(konflikte(offen, alle).map((x) => x.titel)).toEqual(["40. Geburtstag", "Kaffeetrinken"]);
    expect(konflikte(abgelehnt, alle)).toEqual([]);
  });
});

describe("liegtAmTag und amTag", () => {
  it("mehrtägig: jeder berührte Tag zählt", () => {
    const z = e("gesperrt", "2026-11-20", "18:00", "2026-11-22", "10:00");
    expect(["2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22", "2026-11-23"].map((t) => liegtAmTag(z, t))).toEqual([false, true, true, true, false]);
  });

  it("ein Ende genau um Mitternacht gehört nicht zum Folgetag", () => {
    const z = e("zugesagt", "2026-11-07", "18:00", "2026-11-08", "00:00");
    expect(liegtAmTag(z, "2026-11-07")).toBe(true);
    expect(liegtAmTag(z, "2026-11-08")).toBe(false);
  });

  it("Zeitumstellung: der 25-Stunden-Tag (25.10.2026) enthält auch 23:30", () => {
    const z = { von: um("2026-10-25", "23:30"), bis: um("2026-10-26", "00:30") };
    expect(liegtAmTag(z, "2026-10-25")).toBe(true);
    expect(liegtAmTag(z, "2026-10-26")).toBe(true);
  });

  it("amTag sortiert nach Beginn", () => {
    const a = e("zugesagt", "2026-11-07", "18:00", "2026-11-07", "20:00", "spät");
    const b = e("gesperrt", "2026-11-07", "08:00", "2026-11-07", "10:00", "früh");
    expect(amTag([a, b], "2026-11-07").map((x) => x.titel)).toEqual(["früh", "spät"]);
  });
});

describe("öffentliche Sicht", () => {
  const zusage = e("zugesagt", "2026-11-07", "18:00", "2026-11-08", "01:00", "40. Geburtstag von Jana");
  const sperre = e("gesperrt", "2026-11-07", "23:00", "2026-11-08", "03:00", "Dienstabend");
  const offen = e("angefragt", "2026-11-14", "17:00", "2026-11-14", "23:00", "Weihnachtsfeier");
  const anschluss = e("gesperrt", "2026-11-21", "08:00", "2026-11-21", "12:00");
  const anschluss2 = e("zugesagt", "2026-11-21", "12:00", "2026-11-21", "14:00");
  const pub = oeffentlicheBelegung([zusage, sperre, offen, anschluss, anschluss2]);

  it("nur Zeiträume, keine Titel, Kennungen oder Zustände", () => {
    for (const z of pub) expect(Object.keys(z).sort()).toEqual(["bis", "von"]);
    expect(JSON.stringify(pub)).not.toMatch(/Jana|Dienstabend|Weihnachtsfeier|zugesagt|gesperrt|e\d/);
  });

  it("offene Anfragen sind frei", () => {
    expect(pub.some((z) => liegtAmTag(z, "2026-11-14"))).toBe(false);
  });

  it("überschneidende und aneinanderstoßende Zeiträume werden zusammengelegt", () => {
    expect(pub).toEqual([
      { von: um("2026-11-07", "18:00"), bis: um("2026-11-08", "03:00") },
      { von: um("2026-11-21", "08:00"), bis: um("2026-11-21", "14:00") },
    ]);
  });

  it("Tagesstücke: „ab Vortag“ und „bis Folgetag“ als null, Mitternacht als 24:00", () => {
    expect(tagesstuecke(pub, "2026-11-07")).toEqual([{ ab: "18:00", bis: null }]);
    expect(tagesstuecke(pub, "2026-11-08")).toEqual([{ ab: null, bis: "03:00" }]);
    expect(tagesstuecke([{ von: um("2026-11-09", "20:00"), bis: um("2026-11-10", "00:00") }], "2026-11-09")).toEqual([{ ab: "20:00", bis: "24:00" }]);
    expect(tagesstuecke(pub, "2026-11-09")).toEqual([]);
  });
});

describe("Monatsraster", () => {
  it("Montag zuerst: der 1. November 2026 ist ein Sonntag, also sechs Lücken", () => {
    const r = monatsRaster("2026-11");
    expect(r.slice(0, 7)).toEqual([null, null, null, null, null, null, "2026-11-01"]);
    expect(r.filter(Boolean)).toHaveLength(30);
    expect(r[r.length - 1]).toBe("2026-11-30");
  });

  it("Schaltjahr und Monatswechsel über das Jahr", () => {
    expect(monatsRaster("2028-02").filter(Boolean)).toHaveLength(29);
    expect(monatPlus("2026-12", 1)).toBe("2027-01");
    expect(monatPlus("2026-01", -1)).toBe("2025-12");
  });

  it("monatsZeitraum deckt den ganzen Monat in der Suite-Zone", () => {
    const z = monatsZeitraum("2026-11");
    expect(z.von).toBe(um("2026-11-01", "00:00"));
    expect(z.bis).toBe(um("2026-12-01", "00:00"));
  });
});

describe("Vorbelegung für „An diesem Tag anfragen“ (IDA-387)", () => {
  const um = (tag: string, uhr: string) => zeitpunkt(tag, uhr);
  const T = "2026-11-07";
  const belegt = (ab: string, bis: string, bisTag = T) => ({ von: um(T, ab), bis: um(bisTag, bis) });

  it("freier Tag: der übliche Abend", () => {
    expect(vorschlagAmTag([], T)).toEqual({ vonTag: T, vonUhr: "18:00", bisTag: T, bisUhr: "23:00" });
  });

  it("17–21 belegt: der freie Rest des Abends", () => {
    expect(vorschlagAmTag([belegt("17:00", "21:00")], T)).toEqual({ vonTag: T, vonUhr: "21:00", bisTag: T, bisUhr: "23:00" });
  });

  it("ab 19 belegt: fünf Stunden davor; ab 18 bis in die Nacht: der Nachmittag", () => {
    expect(vorschlagAmTag([belegt("19:00", "23:30")], T)).toEqual({ vonTag: T, vonUhr: "14:00", bisTag: T, bisUhr: "19:00" });
    expect(vorschlagAmTag([belegt("18:00", "02:00", "2026-11-08")], T)).toEqual({ vonTag: T, vonUhr: "13:00", bisTag: T, bisUhr: "18:00" });
  });

  it("schiefe Grenzen nach innen auf die Viertelstunde, Ende Mitternacht als Folgetag 00:00", () => {
    expect(vorschlagAmTag([belegt("00:00", "20:10")], T)).toEqual({ vonTag: T, vonUhr: "20:15", bisTag: T, bisUhr: "23:00" });
    expect(vorschlagAmTag([belegt("00:00", "22:30")], T)).toEqual({ vonTag: T, vonUhr: "22:30", bisTag: "2026-11-08", bisUhr: "00:00" });
  });

  it("keine Stunde frei: kein Vorschlag", () => {
    expect(vorschlagAmTag([belegt("00:00", "23:30")], T)).toBeNull();
  });
});
