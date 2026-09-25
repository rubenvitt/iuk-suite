import { FARBEN } from "@/core/theme/tokens";
import { afterEach, describe, expect, it } from "vitest";

import { farbVariablen, schreibeFarbVariablen, variablenName } from "./variablen";

describe("farbVariablen", () => {
  it("führt jede Farbe aus FARBEN als eigene --iuk-*-Variable", () => {
    const variablen = farbVariablen();
    const namen = Object.keys(FARBEN).map(variablenName);
    expect(new Set(namen).size).toBe(namen.length);
    for (const [schluessel, wert] of Object.entries(FARBEN)) {
      const name = variablenName(schluessel);
      expect(name).toMatch(/^--iuk-[a-z]+(-[a-z]+)*$/);
      expect(variablen[name]).toBe(wert);
    }
    expect(Object.keys(variablen)).toHaveLength(Object.keys(FARBEN).length);
  });

  it("nennt die Rohwerte wie tokens/colors.css der Vorlage", () => {
    expect(variablenName("rot")).toBe("--iuk-rot");
    expect(variablenName("rotAufDunkelHover")).toBe("--iuk-rot-auf-dunkel-hover");
    expect(variablenName("kontur")).toBe("--iuk-kontur");
    // `--iuk-linie` ist in colors.css die Rolle (hell/dunkel), der Rohwert heißt `-roh`.
    expect(variablenName("linie")).toBe("--iuk-linie-roh");
    expect(farbVariablen()["--iuk-rot"]).toBe(FARBEN.rot);
  });
});

describe("schreibeFarbVariablen", () => {
  afterEach(() => {
    document.documentElement.removeAttribute("style");
  });

  it("schreibt jede Farbe auf :root, --iuk-rot gleich FARBEN.rot", () => {
    schreibeFarbVariablen(document.documentElement);
    const stil = document.documentElement.style;
    expect(stil.getPropertyValue("--iuk-rot")).toBe(FARBEN.rot);
    for (const [name, wert] of Object.entries(farbVariablen())) {
      expect(stil.getPropertyValue(name)).toBe(wert);
    }
  });
});
