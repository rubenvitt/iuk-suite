import { describe, expect, it } from "vitest";
import { nutzflaeche, plaetzeImRaum, rechne, zelte, zeltmix } from "./rechner";

/**
 * Die Erwartungen sind die Ergebnisse des POC-Rechenkerns aus Lifeline Hub (LLH-1519) für dieselben
 * Eingaben. Den Abgleich mit Lifeline Hub selbst führt `rechner.faelle.test.ts` über die gemeinsamen Fälle;
 * diese Datei hält die Eingaben des Rechners in der Suite fest. Ändert sich hier eine Zahl, ändert sie sich
 * auch in Lifeline Hub.
 */

const DEMO_RAEUME = [
  { bezeichnung: "Halle Teil A", laenge_m: 15, breite_m: 13.5, abzuege: [{ laenge_m: 4, breite_m: 2.5 }], belegung: "maenner" as const },
  { bezeichnung: "Halle Teil B", laenge_m: 15, breite_m: 13.5, abzuege: [], belegung: "frauen" as const },
  { bezeichnung: "Gymnastikraum", laenge_m: 12, breite_m: 8, abzuege: [{ laenge_m: 3, breite_m: 2 }], belegung: "frauen" as const },
  { bezeichnung: "Vereinsraum", laenge_m: 9, breite_m: 6, abzuege: [{ laenge_m: 2, breite_m: 1.5 }], belegung: "maenner" as const },
];

describe("rechne: Personen ohne Trennung", () => {
  const er = rechne({ weg: "personen", trennung: false, personen: { gesamt: 100 } });

  it("rechnet die Richtwerte je Person", () => {
    expect(er.personen).toBe(100);
    expect(er.kapazitaet).toBeNull();
    expect(er.schlafen.flaeche_m2).toBe(400);
    expect(er.material).toEqual({ feldbetten: 100, decken: 200 });
    expect(er.sanitaer).toEqual({ toiletten: 5, urinale: 4, waschplaetze: 20, duschen: 5 });
    expect(er.gesundheit).toEqual({ betten: 5, flaeche_m2: 37.5, isolierstation: false });
    expect(er.versorgung).toEqual({ wasser_l_tag: 2500, davon_trinkwasser_l_tag: 300, faekalien_l_tag: 150, abfall_l_tag: 300 });
  });

  it("legt Zelte je Typ und einen Zeltmix mit Platzbedarf aus", () => {
    expect(er.schlafen.zelte_je_typ).toEqual([
      { typ: "sg20", anzahl: 17 }, { typ: "sg30", anzahl: 10 }, { typ: "sg40", anzahl: 9 }, { typ: "sg50", anzahl: 8 },
    ]);
    expect(er.schlafen.zeltmix).toEqual([{ typ: "sg20", anzahl: 1 }, { typ: "sg50", anzahl: 7 }]);
    expect(er.schlafen.zeltmix_grundflaeche_m2).toBe(418.3);
    expect(er.schlafen.zeltmix_platzbedarf_m2).toBe(689);
  });

  it("rechnet Sitzplätze für ein Drittel und Aufenthaltszelte aus diesen Garnituren (W8, W9)", () => {
    expect(er.verpflegung).toEqual({
      ausgabestellen: 1, sitzplaetze: 34, garnituren: 5,
      aufenthaltszelte_je_typ: [{ typ: "sg20", anzahl: 2 }, { typ: "sg30", anzahl: 1 }, { typ: "sg40", anzahl: 1 }, { typ: "sg50", anzahl: 1 }],
    });
  });
});

describe("rechne: Personen mit Trennung", () => {
  const er = rechne({ weg: "personen", trennung: true, personen: { maenner: 95, frauen: 85 } });

  it("zählt bei Trennung die Summe der Gruppen, nicht das Gesamt (W7)", () => {
    expect(er.gruppen).toEqual([{ gruppe: "maenner", personen: 95 }, { gruppe: "frauen", personen: 85 }]);
    // 95 ÷ 20 → 5 und 85 ÷ 20 → 5; ohne Trennung wären es 9.
    expect(er.sanitaer.toiletten).toBe(10);
    expect(er.sanitaer.duschen).toBe(10);
    expect(er.sanitaer.waschplaetze).toBe(36);
  });

  it("rechnet Urinale aus den Männern (W3)", () => {
    expect(er.sanitaer.urinale).toBe(7);
  });

  it("legt die Zelte je Gruppe aus", () => {
    expect(er.schlafen.zeltmix).toEqual([{ typ: "sg20", anzahl: 1 }, { typ: "sg40", anzahl: 1 }, { typ: "sg50", anzahl: 12 }]);
    expect(er.schlafen.zeltmix_platzbedarf_m2).toBe(1223);
  });
});

describe("rechne: Räume", () => {
  const er = rechne({ weg: "raeume", trennung: true, raeume: DEMO_RAEUME });

  it("rundet die Plätze je Raum ab und summiert sie nach Belegung (W5, W8)", () => {
    expect(er.kapazitaet?.raeume?.map((r) => [r.nutzflaeche_m2, r.plaetze, r.gruppe])).toEqual([
      [192.5, 48, "maenner"], [202.5, 50, "frauen"], [90, 22, "frauen"], [51, 12, "maenner"],
    ]);
    expect(er.gruppen).toEqual([{ gruppe: "maenner", personen: 60 }, { gruppe: "frauen", personen: 72 }]);
    expect(er.personen).toBe(132);
    expect(er.kapazitaet?.plaetze).toBe(132);
  });

  it("rechnet den Bedarf für die Plätze", () => {
    expect(er.sanitaer).toEqual({ toiletten: 7, urinale: 4, waschplaetze: 27, duschen: 7 });
    expect(er.gesundheit).toEqual({ betten: 7, flaeche_m2: 52.5, isolierstation: false });
    expect(er.verpflegung.garnituren).toBe(6);
  });
});

describe("rechne: Zelte und Fläche", () => {
  it("zählt den Zeltbestand in Schlafplätzen", () => {
    const er = rechne({ weg: "zelte", trennung: false, zelte: { gesamt: { sg30: 2, sg50: 4 } } });
    expect(er.personen).toBe(76);
    expect(er.kapazitaet).toEqual({ plaetze: 76, raeume: null });
    expect(er.sanitaer.toiletten).toBe(4);
  });

  it("schaltet ab 201 Personen die Isolierstation und ab 301 die zweite Ausgabestelle zu (W4, W8)", () => {
    const er = rechne({ weg: "flaeche", trennung: false, flaeche: { gesamt_m2: 1204 } });
    expect(er.personen).toBe(301);
    expect(er.gesundheit).toEqual({ betten: 14, flaeche_m2: 105, isolierstation: true });
    expect(er.verpflegung.ausgabestellen).toBe(2);
    expect(er.versorgung.faekalien_l_tag).toBe(451.5);
    expect(rechne({ weg: "personen", personen: { gesamt: 200 } }).gesundheit.isolierstation).toBe(false);
    expect(rechne({ weg: "personen", personen: { gesamt: 300 } }).verpflegung.ausgabestellen).toBe(1);
  });

  it("rundet Plätze aus Fläche ab", () => {
    expect(rechne({ weg: "flaeche", flaeche: { gesamt_m2: 399.9 } }).personen).toBe(99);
  });
});

/** Die beiden Szenarien der Spezifikation in Lifeline Hub (LLH-1520), wörtlich übernommen. */
describe("Szenarien aus LLH-1520", () => {
  it("Personen getrennt: 50 Männer und 50 Frauen", () => {
    const er = rechne({ weg: "personen", trennung: true, personen: { maenner: 50, frauen: 50 } });
    expect(er.schlafen.flaeche_m2).toBe(400);
    expect(er.material.feldbetten).toBe(100);
    expect(er.sanitaer).toEqual({ toiletten: 6, urinale: 4, waschplaetze: 20, duschen: 6 });
    expect(er.versorgung.wasser_l_tag).toBe(2500);
  });

  it("Kapazität aus Räumen: je Raum abgerundet, 48 + 22 = 70 Plätze", () => {
    const er = rechne({ weg: "raeume", raeume: [DEMO_RAEUME[0], DEMO_RAEUME[2]] });
    expect(er.kapazitaet?.raeume?.map((r) => r.plaetze)).toEqual([48, 22]);
    expect(er.kapazitaet?.plaetze).toBe(70);
  });
});

describe("Ränder", () => {
  it("rechnet für niemanden nichts, auch keine Krankenbetten und keine Ausgabestelle", () => {
    const er = rechne({ weg: "personen", personen: { gesamt: 0 } });
    expect(er.gesundheit.betten).toBe(0);
    expect(er.verpflegung.ausgabestellen).toBe(0);
    expect(er.sanitaer.toiletten).toBe(0);
    expect(er.schlafen.zeltmix).toEqual([]);
  });

  it("nimmt negative, leere und unsinnige Zahlen als 0", () => {
    expect(rechne({ weg: "personen", personen: { gesamt: -5 } }).personen).toBe(0);
    expect(rechne({ weg: "personen", personen: { gesamt: Number.NaN } }).personen).toBe(0);
    expect(nutzflaeche({ laenge_m: 5, breite_m: 4, abzuege: [{ laenge_m: 10, breite_m: 10 }] })).toBe(0);
  });

  it("verwirft einen unbekannten Weg laut", () => {
    expect(() => rechne({ weg: "irgendwas" as "personen" })).toThrow(/weg unbekannt/);
  });

  it("legt den Rest in das kleinste passende Zelt", () => {
    const typen = zelte();
    expect(zeltmix(15, typen)).toEqual([{ typ: "sg20", anzahl: 1 }, { typ: "sg50", anzahl: 1 }]);
    expect(zeltmix(26, typen)).toEqual([{ typ: "sg40", anzahl: 1 }, { typ: "sg50", anzahl: 1 }]);
    expect(zeltmix(28, typen)).toEqual([{ typ: "sg50", anzahl: 2 }]);
  });

  it("zählt die Plätze eines Raums wie der Kern", () => {
    expect(plaetzeImRaum(DEMO_RAEUME[0])).toBe(48);
  });
});
