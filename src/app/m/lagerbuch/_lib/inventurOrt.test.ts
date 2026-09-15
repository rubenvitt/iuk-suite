import { describe, expect, it } from "vitest";
import { HANDLAGER_ID } from "./konstanten";
import {
  ZAEHLORT_ALLE,
  zaehlOrtAus,
  zaehlOrtBeschreibung,
  zaehlOrtLabel,
} from "./inventurOrt";

/**
 * DRK-337 — der Zaehlort als reine Funktionen, ohne Datenbank und ohne Rendern.
 */
describe("zaehlOrtAus", () => {
  it("macht aus fehlender Angabe und aus der Vorgabe denselben ganzen Handlager", () => {
    expect(zaehlOrtAus(undefined)).toBeNull();
    expect(zaehlOrtAus("")).toBeNull();
    expect(zaehlOrtAus("   ")).toBeNull();
    expect(zaehlOrtAus(ZAEHLORT_ALLE)).toBeNull();
  });

  it("reicht einen Ort durch, Wurzel wie Schrank", () => {
    expect(zaehlOrtAus(HANDLAGER_ID)).toBe(HANDLAGER_ID);
    expect(zaehlOrtAus(" schrank-1 ")).toBe("schrank-1");
  });

  /**
   * ⚠️ DER PARAMETER KANN EIN ARRAY SEIN (Codex-Befund zum PR). Nexts
   * `SearchParams` ist `string | string[] | undefined`; `?ort=a&ort=b` liefert
   * ein Array, und ein `.trim()` darauf warf — HTTP 500 fuer die ganze Seite.
   * ⚠️ WEDER `typecheck` NOCH `build` SEHEN DAS: eine engere Signatur an der
   * Seite ist eine Behauptung ueber die Laufzeit, keine Zusicherung. Nur ein
   * echter Abruf mit doppeltem Parameter — oder dieser Test.
   */
  it("wirft bei einem wiederholten Parameter nicht", () => {
    expect(() => zaehlOrtAus(["schrank-1", "schrank-2"])).not.toThrow();
  });

  it("nimmt denselben Ort mehrfach als Wahl, zwei verschiedene als Widerspruch", () => {
    // Dieselbe Angabe zweimal ist eine Angabe.
    expect(zaehlOrtAus(["schrank-1", " schrank-1 "])).toBe("schrank-1");
    // Zwei verschiedene sind keine Wahl: den ersten zu nehmen hiesse, sich
    // still fuer eine von zwei Anweisungen zu entscheiden.
    expect(zaehlOrtAus(["schrank-1", "schrank-2"])).toBeNull();
    // Die Vorgabe zaehlt dabei nicht mit — sie IST der Rueckfall.
    expect(zaehlOrtAus([ZAEHLORT_ALLE, "schrank-1"])).toBe("schrank-1");
    expect(zaehlOrtAus([])).toBeNull();
    expect(zaehlOrtAus(["", "  "])).toBeNull();
  });
});

describe("zaehlOrtLabel", () => {
  /**
   * ⚠️ DIE WURZEL HEISST NICHT WIE IHR LAGERORT. „Handlager" stuende fuer
   * denselben Bereich wie „ganzer Handlager", und im append-only Verlauf waere
   * danach nicht mehr zu erkennen, ob jemand alles gezaehlt hat oder nur das
   * Unsortierte.
   */
  it("unterscheidet ganzen Handlager, Wurzel und Schrank", () => {
    expect(zaehlOrtLabel(null, undefined)).toBe("Ganzer Handlager");
    expect(zaehlOrtLabel(ZAEHLORT_ALLE, undefined)).toBe("Ganzer Handlager");
    expect(zaehlOrtLabel(HANDLAGER_ID, "Handlager")).toBe("Nicht zugeordnet");
    expect(zaehlOrtLabel("schrank-1", "Schrank 1")).toBe("Schrank 1");
  });

  /** Ohne Namen die Kennung: eine leere Beschriftung waere schlimmer als eine rohe. */
  it("faellt ohne Namen auf die Kennung zurueck", () => {
    expect(zaehlOrtLabel("schrank-1", undefined)).toBe("schrank-1");
  });
});

describe("zaehlOrtBeschreibung", () => {
  it("nennt je Fall, was gezaehlt wird", () => {
    expect(zaehlOrtBeschreibung(null, undefined)).toContain("gesamten Handlager");
    expect(zaehlOrtBeschreibung(HANDLAGER_ID, undefined)).toContain("noch keinem Schrank zugeordnet");
    expect(zaehlOrtBeschreibung("schrank-1", "Schrank 1")).toContain("in Schrank 1");
  });
});
