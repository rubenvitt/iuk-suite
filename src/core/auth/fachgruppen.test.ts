import { describe, it, expect } from "vitest";
import { parseFachgruppen } from "@/core/auth/fachgruppen";

describe("parseFachgruppen", () => {
  it("liest den konfigurierten Claim als string[]", () => {
    expect(parseFachgruppen({ fachgruppen: ["sanitaet", "iuk"] })).toEqual(["sanitaet", "iuk"]);
    expect(parseFachgruppen({ iuk_fachgruppen: ["iuk"] }, "iuk_fachgruppen")).toEqual(["iuk"]);
  });

  // Sicherheitsgrenze: fehlender Claim ergibt die LEERE Menge, nie "alle".
  it("liefert [] wenn der Claim ganz fehlt", () => {
    expect(parseFachgruppen({})).toEqual([]);
    expect(parseFachgruppen({ groups: ["da-feedback-gl"] })).toEqual([]);
  });

  it("liefert [] bei leerem Array", () => {
    expect(parseFachgruppen({ fachgruppen: [] })).toEqual([]);
  });

  // Keine Koerzion, kein Zerlegen an Trennzeichen: eine Zeichenkette ist KEIN Array.
  it("akzeptiert nur Arrays — keine String-Koerzion, kein Split", () => {
    expect(parseFachgruppen({ fachgruppen: "sanitaet" })).toEqual([]);
    expect(parseFachgruppen({ fachgruppen: "sanitaet,iuk" })).toEqual([]);
    expect(parseFachgruppen({ fachgruppen: 42 })).toEqual([]);
    expect(parseFachgruppen({ fachgruppen: { sanitaet: true } })).toEqual([]);
    expect(parseFachgruppen({ fachgruppen: null })).toEqual([]);
  });
});
