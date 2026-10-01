import { describe, expect, it } from "vitest";
import { kalendertag, rahmenFuer } from "./rahmen";

describe("Rahmentexte", () => {
  it("Kalendertag in UTC, unabhängig von der Suite-Zone", () => {
    expect(kalendertag(Date.UTC(2026, 1, 22))).toBe("22.02.2026");
    expect(kalendertag(null)).toBeNull();
  });
  it("Stand in der Suite-Zone (Vorgabe Europe/Berlin)", () => {
    const r = rahmenFuer({ titel: "T", anlass: "Einsatz", datum: Date.UTC(2026, 1, 22), aktualisiertAm: Date.UTC(2026, 8, 30, 9, 56), aktualisiertVon: "BL BVS", vermerkVsNfD: true,
      kopf: { organisation: "Musterorganisation", logo: null } });
    expect(r).toEqual({
      titel: "T", untertitel: "Einsatz · 22.02.2026", stand: "Stand: 30.09.2026, 11:56", bearbeiter: "Bearbeitung: BL BVS",
      vermerkVsNfD: true, organisation: "Musterorganisation", logo: null,
    });
  });
  it("ohne Namen (leer gespeichert) keine Angabe „Bearbeitung“ — nie E-Mail oder Kennung (Abnahme)", () => {
    expect(rahmenFuer({ titel: "T", anlass: null, datum: null, aktualisiertAm: 0, aktualisiertVon: "", vermerkVsNfD: false, kopf: { organisation: null, logo: null } }).bearbeiter).toBe("");
  });
  it("ohne Anlass und Datum kein Untertitel", () => {
    expect(rahmenFuer({ titel: "T", anlass: null, datum: null, aktualisiertAm: 0, aktualisiertVon: "x", vermerkVsNfD: false, kopf: { organisation: null, logo: null } }).untertitel).toBeNull();
  });
  it("kein Organisationsname aus dem Code: ohne Briefkopf bleibt er null", () => {
    expect(rahmenFuer({ titel: "T", anlass: null, datum: null, aktualisiertAm: 0, aktualisiertVon: "x", vermerkVsNfD: false, kopf: { organisation: null, logo: null } }).organisation).toBeNull();
  });
});
