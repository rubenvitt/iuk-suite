import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrierteTestDb, type TestDb } from "../../_db/testdb";
import { artikel, buchungen, chargen, lagerorte, lagerortVerfall, newId } from "../../_db/schema";
import { ENTNAHMEBOX_ID, HANDLAGER_ID } from "../konstanten";
import { bestandsverlauf, werteAus, KEIN_FILTER } from "../statistik/auswertung";
import { bewegungsArt, statistikDaten, type StatistikDaten } from "./statistik";

const T = (iso: string) => new Date(iso);
/** Mitte Oktober 2026, Berliner Zeit — der laufende Monat ist der Oktober. */
const JETZT = T("2026-10-15T10:00:00Z");
let t: TestDb;

type Typ = "zugang" | "entnahme" | "korrektur" | "umlagerung";

function buche(ts: string, typ: Typ, menge: number, p: {
  ort?: string; artikelId?: string; chargeId?: string; referenz?: string | null;
} = {}) {
  t.db.insert(buchungen).values({
    id: newId(), ts: T(ts), typ, artikelId: p.artikelId ?? "a1", chargeId: p.chargeId ?? "c1",
    lagerortId: p.ort ?? HANDLAGER_ID, menge, quelleTyp: "system", quelleId: "system",
    referenz: p.referenz ?? null, kommentar: null,
  }).run();
}

beforeEach(() => {
  t = migrierteTestDb("lagerbuch-lp-statistik-");
  t.db.insert(artikel).values([
    { id: "a1", name: "Verbandpäckchen", einheit: "Stk.", fach: "A1", kategorie: "Verband",
      mindestbestand: 0, aktiv: true, createdAt: T("2026-01-01T00:00:00Z") },
    { id: "a2", name: "NaCl 500 ml", einheit: "Fl.", fach: "B2", kategorie: "Infusion",
      mindestbestand: 0, aktiv: true, createdAt: T("2026-01-01T00:00:00Z") },
  ]).run();
  t.db.insert(chargen).values([
    { id: "c1", artikelId: "a1", chargenNr: "CH1", verfall: "2026-12", createdAt: T("2026-01-01T00:00:00Z") },
    { id: "c2", artikelId: "a2", chargenNr: "CH2", verfall: "2026-08", createdAt: T("2026-01-01T00:00:00Z") },
  ]).run();
  t.db.insert(lagerorte).values(
    { id: "rtw", name: "RTW 1", typ: "fahrzeug", einheitenart: "fahrzeug", kennung: "1/83-1" },
  ).run();
});
afterEach(() => t.schliessen());

function daten(monate: 3 | 6 | 12 | 24 = 3): StatistikDaten {
  return statistikDaten(t.db, monate, JETZT);
}

describe("bewegungsArt — was als Verbrauch zaehlt", () => {
  it.each([
    [{ typ: "entnahme", klasse: "", summe: -4 }, false, { art: "regal", n: 4 }],
    [{ typ: "korrektur", klasse: "check", summe: -2 }, true, { art: "einheit", n: 2 }],
    [{ typ: "umlagerung", klasse: "", summe: 5 }, true, { art: "nachschub", n: 5 }],
    [{ typ: "korrektur", klasse: "aussondern", summe: -3 }, false, { art: "aussondern", n: 3 }],
    [{ typ: "korrektur", klasse: "inventur", summe: -1 }, false, { art: "inventur", n: -1 }],
    [{ typ: "zugang", klasse: "", summe: 10 }, false, { art: "zugang", n: 10 }],
  ] as const)("%o an Einheit=%s -> %o", (g, anEinheit, erwartet) => {
    expect(bewegungsArt(g, anEinheit)).toEqual(erwartet);
  });

  it.each([
    ["Umlagerung, Minus-Leg am Handlager", { typ: "umlagerung", klasse: "", summe: -5 }, false],
    ["Umlagerung zurueck ins Handlager", { typ: "umlagerung", klasse: "", summe: 5 }, false],
    ["positiver Check-Abgleich", { typ: "korrektur", klasse: "check", summe: 2 }, true],
    ["Handkorrektur", { typ: "korrektur", klasse: "", summe: -2 }, false],
  ] as const)("%s zaehlt nirgends", (_name, g, anEinheit) => {
    expect(bewegungsArt(g, anEinheit)).toBeNull();
  });
});

describe("statistikDaten", () => {
  it("legt die Monate in die Suite-Zone: 31.10. 23:30 Berlin ist Oktober, nicht November", () => {
    // 2026-10-31T22:30Z = 23:30 MEZ (nach der Zeitumstellung am 25.10.).
    const spaet = statistikDaten(t.db, 3, T("2026-11-02T10:00:00Z"));
    buche("2026-10-31T22:30:00Z", "entnahme", -3);
    const d = statistikDaten(t.db, 3, T("2026-11-02T10:00:00Z"));
    expect(spaet.monate.map((m) => m.schluessel)).toEqual(["2026-09", "2026-10", "2026-11"]);
    expect(d.bewegungen).toEqual([{ m: 1, a: "a1", o: null, art: "regal", n: 3 }]);
  });

  it("zaehlt Entnahme und Check-Fehlmenge als Verbrauch, die Umlagerung als Nachschub", () => {
    t.db.transaction(() => {
      buche("2026-09-01T08:00:00Z", "zugang", 20);
      buche("2026-09-02T08:00:00Z", "entnahme", -4);
      // Umlagerung Handlager -> RTW: zwei Legs.
      buche("2026-09-03T08:00:00Z", "umlagerung", -6, { referenz: "entnahme-ziel:rtw" });
      buche("2026-09-03T08:00:00Z", "umlagerung", 6, { ort: "rtw", referenz: "entnahme-ziel:rtw" });
      // Check: zwei fehlen am RTW.
      buche("2026-10-05T08:00:00Z", "korrektur", -2, { ort: "rtw", referenz: "check:k1" });
    });
    const d = daten();
    const a = werteAus(d, KEIN_FILTER);
    expect(a.kennzahlen).toEqual({ verbrauch: 6, zugang: 20, aussonderung: 0, inventur: 0 });
    expect(a.verbrauchJeMonat.map((m) => [m.label, m.regal, m.einheit])).toEqual([
      ["Aug 26", 0, 0], ["Sep 26", 4, 0], ["Okt 26", 0, 2],
    ]);
    expect(a.jeEinheit).toEqual([{ id: "rtw", label: "RTW 1 · Fahrzeug · 1/83-1", nachschub: 6, fehlmenge: 2 }]);
  });

  it("zaehlt die Entnahmebox weder als Handlager noch als Einheit", () => {
    t.db.transaction(() => {
      buche("2026-09-01T08:00:00Z", "zugang", 10);
      buche("2026-09-02T08:00:00Z", "umlagerung", -3);
      buche("2026-09-02T08:00:00Z", "umlagerung", 3, { ort: ENTNAHMEBOX_ID });
    });
    const d = daten();
    const a1 = d.artikel.find((a) => a.id === "a1")!;
    expect([a1.handlager, a1.einheiten]).toEqual([7, 0]);
    expect(werteAus(d, KEIN_FILTER).jeEinheit).toEqual([]);
  });

  it("rechnet den Bestandsverlauf aus dem Startbestand vor dem Zeitraum plus allen Aenderungen", () => {
    t.db.transaction(() => {
      buche("2026-01-10T08:00:00Z", "zugang", 10);                         // vor dem Zeitraum
      buche("2026-09-03T08:00:00Z", "umlagerung", -4);
      buche("2026-09-03T08:00:00Z", "umlagerung", 4, { ort: "rtw" });
      buche("2026-10-03T08:00:00Z", "korrektur", 2);                        // Handkorrektur
    });
    expect(bestandsverlauf(daten(), "a1")).toEqual([
      { label: "Aug 26", handlager: 10, einheiten: 0 },
      { label: "Sep 26", handlager: 6, einheiten: 4 },
      { label: "Okt 26", handlager: 8, einheiten: 4 },
    ]);
  });

  it("fuehrt Aussonderung und Inventur getrennt vom Verbrauch", () => {
    t.db.transaction(() => {
      buche("2026-09-01T08:00:00Z", "zugang", 10);
      buche("2026-09-05T08:00:00Z", "korrektur", -3, { referenz: `aussondern:${HANDLAGER_ID}` });
      buche("2026-10-05T08:00:00Z", "korrektur", -1, { referenz: "inventur:i1" });
      buche("2026-10-05T08:00:00Z", "korrektur", 2, { artikelId: "a2", chargeId: "c2", referenz: "inventur:i1" });
    });
    const a = werteAus(daten(), KEIN_FILTER);
    expect(a.kennzahlen).toEqual({ verbrauch: 0, zugang: 10, aussonderung: 3, inventur: 1 });
    expect(a.aussonderungJeMonat.map((m) => m.menge)).toEqual([0, 3, 0]);
  });

  it("filtert nach Kategorie und meldet gemischte Zaehleinheiten nur ohne Filter", () => {
    t.db.transaction(() => {
      buche("2026-09-01T08:00:00Z", "entnahme", -2);
      buche("2026-09-01T08:00:00Z", "entnahme", -5, { artikelId: "a2", chargeId: "c2" });
    });
    const d = daten();
    expect(werteAus(d, KEIN_FILTER).gemischteEinheiten).toBe(true);
    const verband = werteAus(d, { kategorie: "verband", artikelId: null });
    expect(verband.kennzahlen.verbrauch).toBe(2);
    expect(verband.gemischteEinheiten).toBe(false);
  });

  it("sagt die Reichweite aus dem Handlager-Bestand und dem Monatsmittel voraus", () => {
    t.db.transaction(() => {
      buche("2026-07-01T08:00:00Z", "zugang", 100);
      buche("2026-08-10T08:00:00Z", "entnahme", -10);
      buche("2026-09-10T08:00:00Z", "entnahme", -10);
    });
    const d = daten();
    const [top] = werteAus(d, KEIN_FILTER).top;
    expect(top.id).toBe("a1");
    expect(top.verbrauch).toBe(20);
    expect(top.handlager).toBe(80);
    // 1.8.–15.10. sind ~2,5 Monate -> ~8 je Monat -> ~10 Monate Reichweite.
    expect(top.jeMonat).toBeGreaterThan(7.5);
    expect(top.jeMonat).toBeLessThan(8.5);
    expect(top.reichweite).toBeGreaterThan(9);
    expect(top.reichweite).toBeLessThan(11);
  });

  it("legt den Handlager-Rest in die Verfallsvorschau, Abgelaufenes in den ersten Balken", () => {
    t.db.transaction(() => {
      buche("2026-01-10T08:00:00Z", "zugang", 7);                                      // c1, 2026-12
      buche("2026-01-10T08:00:00Z", "zugang", 4, { artikelId: "a2", chargeId: "c2" }); // c2, 2026-08
      buche("2026-02-10T08:00:00Z", "umlagerung", -2);
      buche("2026-02-10T08:00:00Z", "umlagerung", 2, { ort: "rtw" });
    });
    const a = werteAus(daten(), KEIN_FILTER);
    expect(a.verfallVorschau[0]).toEqual({ label: "abgelaufen", menge: 4 });
    expect(a.verfallVorschau.find((m) => m.label === "Dez 26")?.menge).toBe(5);
  });

  it("zaehlt warnende Verfallsmeldungen an Einheiten getrennt", () => {
    t.db.insert(lagerortVerfall).values({
      id: newId(), lagerortId: "rtw", artikelId: "a1", verfall: "2026-09",
      erfasstAt: T("2026-09-01T00:00:00Z"), quelleTyp: "system", quelleId: "system",
    }).run();
    expect(daten().einheitenVerfallWarnend).toBe(1);
  });

  it("liefert nur serialisierbare Werte (RSC-Grenze, Falle 9)", () => {
    buche("2026-09-01T08:00:00Z", "entnahme", -2);
    const d = daten();
    expect(JSON.parse(JSON.stringify(d))).toEqual(d);
  });
});
