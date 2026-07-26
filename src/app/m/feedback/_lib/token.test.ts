import { describe, it, expect } from "vitest";
import { parseToken, buildToken, generateSecret } from "./token";

describe("parseToken", () => {
  it("zerlegt slug und 5-Zeichen-secret positionsbasiert", () => {
    expect(parseToken("muenchen-ab3x9")).toEqual({ slug: "muenchen", secret: "ab3x9" });
  });
  it("erhält Bindestriche im slug (kein split)", () => {
    expect(parseToken("nord-west-team-ab3x9")).toEqual({
      slug: "nord-west-team",
      secret: "ab3x9",
    });
  });
  it("null bei zu kurzer Eingabe (<7)", () => {
    expect(parseToken("ab3x9")).toBeNull();
    expect(parseToken("x-ab3x")).toBeNull();
  });
  it("null bei leerem slug", () => {
    expect(parseToken("-ab3x9")).toBeNull();
  });
});

describe("buildToken", () => {
  it("fügt mit Bindestrich zusammen", () => {
    expect(buildToken("muenchen", "ab3x9")).toBe("muenchen-ab3x9");
  });
});

describe("generateSecret", () => {
  it("liefert 5 Zeichen aus [a-z0-9]", () => {
    const s = generateSecret();
    expect(s).toMatch(/^[a-z0-9]{5}$/);
  });
  it("ist mit injizierter rng deterministisch", () => {
    expect(generateSecret(() => 0)).toBe("aaaaa");
  });
});
