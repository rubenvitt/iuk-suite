import { describe, expect, it } from "vitest";
import { etagVon, unveraendert } from "./etag";

describe("etag", () => {
  it("ist je Körper fest und ändert sich mit ihm", () => {
    expect(etagVon("{}")).toBe(etagVon("{}"));
    expect(etagVon("{}")).not.toBe(etagVon('{"a":1}'));
    expect(etagVon("{}")).toMatch(/^"[\w-]{22}"$/);
  });

  it("vergleicht schwach, auch in einer Liste", () => {
    const e = etagVon("{}");
    expect(unveraendert(e, e)).toBe(true);
    expect(unveraendert(`W/${e}`, e)).toBe(true);
    expect(unveraendert(`"alt", ${e}`, e)).toBe(true);
    expect(unveraendert('"alt"', e)).toBe(false);
    expect(unveraendert(null, e)).toBe(false);
  });
});
