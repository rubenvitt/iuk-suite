import { describe, expect, it } from "vitest";
import { korrektur, markeFuer } from "./marken";
import { RICHTWERTE_BASIS } from "./richtwerte";

describe("Marken mit Kurztext (IDA-390)", () => {
  it("belegte Werte bleiben ohne Marke", () => {
    expect(markeFuer("wasser_je_person_l")).toBeNull();
    expect(markeFuer("gibt_es_nicht")).toBeNull();
  });

  it("eine Annahme sagt, was angenommen ist, mit dem Wert", () => {
    expect(markeFuer("decken_je_person")).toEqual({ herkunft: "annahme", text: "Annahme: 2 je Person" });
    expect(markeFuer("krankenflaeche_je_bett_m2")?.text).toBe("Annahme: 7,5 m² je Bett");
  });

  it("jede Annahme der Basis bekommt einen kurzen Text ohne Befundkürzel", () => {
    for (const r of RICHTWERTE_BASIS.filter((x) => x.herkunft === "annahme")) {
      const t = markeFuer(r.schluessel)?.text ?? "";
      expect(t.startsWith("Annahme: ")).toBe(true);
      expect(t.length).toBeLessThanOrEqual(48);
      expect(t).not.toMatch(/\b[WF]\d\b|Befund/);
    }
  });

  it("korrigiert nennt die heutige Rechnung", () => {
    expect(korrektur("urinale").text).toBe("korrigiert: 1 je 15 Männer");
    expect(korrektur("aufenthaltszelte").herkunft).toBe("korrigiert");
  });
});
