import { describe, expect, it } from "vitest";
import { falte, trifftSuche } from "./suche";

describe("Stammdatensuche", () => {
  it("faltet Groß/Klein, Umlaute und ß", () => {
    expect(falte("Übel, Jörg-Straße")).toBe("ubel, jorg-strasse");
  });

  it("findet eine Person über Teile des Namens, in jeder Reihenfolge", () => {
    const felder = ["Beispiel, Änne"];
    expect(trifftSuche(felder, "beisp")).toBe(true);
    expect(trifftSuche(felder, "anne beispiel")).toBe(true);
    expect(trifftSuche(felder, "ÄNNE")).toBe(true);
    expect(trifftSuche(felder, "anne muster")).toBe(false);
  });

  it("findet ein Fahrzeug über Kennung oder Funkrufname", () => {
    const felder = ["ELW 1", "Rotkreuz Musterstadt 11/12-1", "KTW"];
    expect(trifftSuche(felder, "11/12")).toBe(true);
    expect(trifftSuche(felder, "elw")).toBe(true);
    expect(trifftSuche(felder, "rtw")).toBe(false);
  });

  it("leere Suche trifft alles", () => {
    expect(trifftSuche(["x"], "  ")).toBe(true);
  });
});
