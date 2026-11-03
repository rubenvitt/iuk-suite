import { describe, expect, it } from "vitest";
import { tageDativ } from "./faelligkeiten";

describe("tageDativ", () => {
  it("Einzahl und Mehrzahl", () => {
    expect(tageDativ(1)).toBe("1 Tag");
    expect(tageDativ(4)).toBe("4 Tagen");
  });
});

describe("eintragSichtbar (IDA-312)", () => {
  it("ohne Einschränkung sieht es jeder, mit nur die genannten Gruppen", async () => {
    const { eintragSichtbar } = await import("./faelligkeiten");
    expect(eintragSichtbar({}, null)).toBe(true);
    expect(eintragSichtbar({ sichtbarFuer: ["a"] }, ["b", "a"])).toBe(true);
    expect(eintragSichtbar({ sichtbarFuer: ["a"] }, ["b"])).toBe(false);
    expect(eintragSichtbar({ sichtbarFuer: ["a"] }, null)).toBe(false);
  });
});
