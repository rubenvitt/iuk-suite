import { describe, expect, it } from "vitest";
import { KLEINSTE_SCHRIFT_PT, MIN_MASSSTAB, SCHRIFT, lueckeFuer, zeilenhoehe } from "./masse";

describe("Maße", () => {
  it("die kleinste Schrift der Zeichnung ist 8 pt, also Mindestmaßstab 0,75", () => {
    expect(KLEINSTE_SCHRIFT_PT).toBe(Math.min(...Object.values(SCHRIFT)));
    expect(KLEINSTE_SCHRIFT_PT).toBe(8);
    expect(MIN_MASSSTAB).toBeCloseTo(0.75, 10);
  });
  it("Zeilenhöhe = Schriftgröße in mm × 1,15", () => {
    expect(zeilenhoehe(8)).toBeCloseTo(8 * (25.4 / 72) * 1.15, 10);
  });
  it("Ebenenlücke: 15,5 mm, je weiterem Knick 1,5 mm mehr", () => {
    expect(lueckeFuer(0)).toBeCloseTo(15.5, 10);
    expect(lueckeFuer(1)).toBeCloseTo(15.5, 10);
    expect(lueckeFuer(3)).toBeCloseTo(18.5, 10);
  });
});
