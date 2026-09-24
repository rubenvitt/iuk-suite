import { describe, expect, it } from "vitest";
import { istEinsatz } from "./format";
import { beispielEinsatz } from "./testhilfe";

describe("istEinsatz", () => {
  it("ein vollständiger Einsatz ist gültig", () => {
    expect(istEinsatz(beispielEinsatz())).toBe(true);
  });
  it("ein fremdes Feld macht den Einsatz ungültig", () => {
    expect(istEinsatz({ ...beispielEinsatz(), fremd: "x" })).toBe(false);
  });
  it("vorOrt darf nicht negativ sein", () => {
    expect(istEinsatz({ ...beispielEinsatz(), vorOrt: -1 })).toBe(false);
  });
  it("vorOrt muss eine ganze Zahl sein", () => {
    expect(istEinsatz({ ...beispielEinsatz(), vorOrt: 1.5 })).toBe(false);
  });
  it("endeZeit darf nicht undefined sein", () => {
    expect(istEinsatz({ ...beispielEinsatz(), endeZeit: undefined })).toBe(false);
  });
  it("eine Person ohne fahrzeugId ist ungültig", () => {
    const einsatz = beispielEinsatz();
    const ohneFahrzeugId: Record<string, unknown> = { ...einsatz.personal[0] };
    delete ohneFahrzeugId.fahrzeugId;
    expect(istEinsatz({ ...einsatz, personal: [ohneFahrzeugId, einsatz.personal[1]] })).toBe(false);
  });
});
