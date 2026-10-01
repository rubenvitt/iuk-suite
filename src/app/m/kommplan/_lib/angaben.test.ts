import { describe, expect, it } from "vitest";
import { angabenSchema, msZuTag, tagZuMs } from "./angaben";

describe("Planangaben", () => {
  it("trimmt, macht aus Leerem null und prüft den Kalendertag", () => {
    expect(angabenSchema.parse({ titel: "  Einsatz  ", typ: "fernmeldeskizze", anlass: "  ", datum: "" }))
      .toEqual({ titel: "Einsatz", typ: "fernmeldeskizze", anlass: null, datum: null });
    expect(angabenSchema.safeParse({ titel: " ", typ: "kommunikationsplan", anlass: null, datum: null }).success).toBe(false);
    expect(angabenSchema.safeParse({ titel: "X", typ: "kommunikationsplan", anlass: null, datum: "2026-02-30" }).success).toBe(false);
    expect(angabenSchema.safeParse({ titel: "X", typ: "andere", anlass: null, datum: null }).success).toBe(false);
  });
  it("Kalendertag ↔ Mitternacht UTC, unabhängig von der Suite-Zone", () => {
    expect(tagZuMs("2026-02-22")).toBe(Date.UTC(2026, 1, 22));
    expect(msZuTag(Date.UTC(2026, 1, 22))).toBe("2026-02-22");
    expect(msZuTag(null)).toBeNull();
  });
});
