import { describe, expect, it } from "vitest";
import { bereinigePunkte, checklisteFuer, ortsartAus, SONSTIGES } from "./checkliste";

describe("Checkliste einer Mängelmeldung", () => {
  it("leitet die Ortsart aus Typ und Einheitenart ab", () => {
    expect(ortsartAus({ typ: "lager", einheitenart: null })).toBe("schrank");
    expect(ortsartAus({ typ: "fahrzeug", einheitenart: "fahrzeug" })).toBe("fahrzeug");
    expect(ortsartAus({ typ: "fahrzeug", einheitenart: "tasche" })).toBe("tasche");
    expect(ortsartAus({ typ: "fahrzeug", einheitenart: null })).toBe("einheit");
  });

  it("endet für jede Ortsart mit „Etwas anderes“ und hat keine Doppel", () => {
    for (const art of ["fahrzeug", "tasche", "einheit", "schrank"] as const) {
      const punkte = checklisteFuer(art);
      expect(punkte.at(-1)).toBe(SONSTIGES);
      expect(new Set(punkte).size).toBe(punkte.length);
    }
  });

  it("verwirft erfundene und fremde Punkte und ordnet nach der Liste", () => {
    const fahrzeug = checklisteFuer("fahrzeug");
    expect(bereinigePunkte([SONSTIGES, "erfunden", fahrzeug[0], fahrzeug[0], 7], "fahrzeug"))
      .toEqual([fahrzeug[0], SONSTIGES]);
    expect(bereinigePunkte(["Tasche beschädigt"], "schrank")).toEqual([]);
  });
});
