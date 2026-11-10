import { describe, expect, it } from "vitest";
import { einsatzbereitschaftAus, statusText } from "./einsatzbereitschaft";

describe("einsatzbereitschaftAus", () => {
  it.each([
    [null, "einsatzbereit"],
    ["", "einsatzbereit"],
    ["Einsatzbereit", "einsatzbereit"],
    [" einsatzbereit ", "einsatzbereit"],
    ["Ausgeliehen", "einsatzbereit"],
    ["ON_LOAN", "einsatzbereit"],
    ["Defekt", "nicht-einsatzbereit"],
    ["Wartung", "nicht-einsatzbereit"],
    ["in Reparatur", "nicht-einsatzbereit"],
    ["Sonstiges", "nicht-einsatzbereit"],
    ["ausgemustert", "ausgemustert"],
  ] as const)("%s → %s", (roh, erwartet) => {
    expect(einsatzbereitschaftAus(roh)).toBe(erwartet);
  });

  it("zeigt einen leeren Status als einsatzbereit", () => {
    expect(statusText(null)).toBe("einsatzbereit");
    expect(statusText("  in Reparatur ")).toBe("in Reparatur");
  });
});
