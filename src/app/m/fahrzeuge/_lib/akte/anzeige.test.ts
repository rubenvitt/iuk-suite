import { describe, expect, it } from "vitest";
import { ruhigeAkte, volleAkte } from "../../_ui/akte/fixtures";
import { abstandText, cmAlsMeter, dotAlterJahre, fahrzeugTitel, kgText, meterAlsCm, reifenTeil, schlimmstePruefung, schlimmsteZuerst } from "./anzeige";

describe("Maße: Meter mit Komma, gespeichert in Zentimetern", () => {
  it("liest Komma, Punkt und ganze Meter", () => {
    expect(meterAlsCm("5,30")).toBe(530);
    expect(meterAlsCm("5.3")).toBe(530);
    expect(meterAlsCm(" 7 ")).toBe(700);
    expect(meterAlsCm("2,05")).toBe(205);
  });
  it("leer heißt nicht erfasst, Unsinn wird nicht geraten", () => {
    expect(meterAlsCm("")).toBeNull();
    expect(meterAlsCm("   ")).toBeNull();
    for (const text of ["fünf", "5,300", "530", "-2", "5,3 m", "1,2,3"]) expect(meterAlsCm(text)).toBe("ungueltig");
  });
  it("schreibt zwei Nachkommastellen mit Komma und kommt durch den Rundlauf", () => {
    expect(cmAlsMeter(530)).toBe("5,30");
    expect(cmAlsMeter(199)).toBe("1,99");
    expect(cmAlsMeter(null)).toBe("");
    for (const cm of [1, 99, 100, 229, 695, 1234]) expect(meterAlsCm(cmAlsMeter(cm))).toBe(cm);
  });
  it("gruppiert Kilogramm", () => {
    expect(kgText(640)).toBe("640 kg");
    expect(kgText(7490)).toBe("7.490 kg");
  });
});

describe("Reifenalter aus der DOT", () => {
  it("zählt volle Jahre seit der Herstellwoche", () => {
    expect(dotAlterJahre("3822", "2026-11-12")).toBe(4);
    expect(dotAlterJahre("4722", "2026-11-12")).toBe(3);
    expect(dotAlterJahre("0126", "2026-11-12")).toBe(0);
  });
  it("eine DOT, die keine ist, hat kein Alter", () => {
    expect(dotAlterJahre("", "2026-11-12")).toBeNull();
    expect(dotAlterJahre("5422", "2026-11-12")).toBeNull();
    expect(dotAlterJahre("38/22", "2026-11-12")).toBeNull();
  });
});

describe("Rangfolge", () => {
  it("schlimmste zuerst, bei Gleichstand in der Reihenfolge der Liste", () => {
    const a = ruhigeAkte();
    const b = volleAkte();
    const c = ruhigeAkte();
    expect(schlimmsteZuerst([a, b, c])).toEqual([b, a, c]);
  });
  it("aus mehreren Prüfungen zählt die schlimmste", () => {
    const { stand } = volleAkte();
    expect(schlimmstePruefung(stand.pruefungen)?.pruefung.id).toBe("p-hu");
    expect(schlimmstePruefung([])).toBeNull();
  });
  it("bei den Reifen gewinnt der schlimmere Teil, bei Gleichstand die Saison", () => {
    const r = volleAkte().stand.reifen!;
    expect(reifenTeil(r)).toBe(r.saison);
    expect(reifenTeil({ ...r, alter: { stufe: "bald", text: "7 Jahre alt, Ersatz einplanen", kurz: "7 Jahre alt" } }).kurz).toBe("7 Jahre alt");
  });
});

describe("Texte", () => {
  it("der Titel ist Typ und Funkkenner, ohne Funkkenner der Funkrufname", () => {
    expect(fahrzeugTitel({ typ: "RTW", funkkenner: "11-83-1", funkrufname: "Rotkreuz Uelzen 11-83-1" })).toBe("RTW 11-83-1");
    expect(fahrzeugTitel({ typ: "Anhänger", funkkenner: null, funkrufname: "Anhänger Betreuung Uelzen" })).toBe("Anhänger Betreuung Uelzen");
  });
  it("der Abstand nennt Monate und, wo gesetzt, Kilometer", () => {
    expect(abstandText(24, null)).toBe("alle 24 Monate");
    expect(abstandText(12, "30.000 km")).toBe("alle 12 Monate oder 30.000 km");
    expect(abstandText(1, null)).toBe("jeden Monat");
  });
});
