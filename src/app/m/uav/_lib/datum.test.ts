import { it, expect } from "vitest";
import { datumKurz, datumZeit } from "./datum";

const ISO = "2026-08-29T09:14:22.481Z";

it("datumKurz: dd.mm.yyyy, leerer String für null", () => {
  expect(datumKurz(ISO)).toBe("29.08.2026");
  expect(datumKurz(null)).toBe("");
});

it("datumZeit: dd.mm.yyyy, HH:MM (Europe/Berlin), leerer String für null", () => {
  expect(datumZeit(ISO)).toBe("29.08.2026, 11:14");
  expect(datumZeit(null)).toBe("");
});
