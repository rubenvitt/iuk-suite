import { describe, expect, it } from "vitest";
import { tageDativ } from "./faelligkeiten";

describe("tageDativ", () => {
  it("Einzahl und Mehrzahl", () => {
    expect(tageDativ(1)).toBe("1 Tag");
    expect(tageDativ(4)).toBe("4 Tagen");
  });
});
