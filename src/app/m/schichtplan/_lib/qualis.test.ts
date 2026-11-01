import { describe, expect, it } from "vitest";
import { alsFahrerlaubnis, erfuellt, qualiKatalog } from "./qualis";

const q = (kurz: string, name = kurz) => ({ kurz, name });

describe("erfuellt", () => {
  it("höhere Stufe derselben Leiter deckt die niedrigere, nicht umgekehrt", () => {
    expect(erfuellt([q("RS", "Rettungssanitäter")], q("San", "Sanitäter"))).toBe(true);
    expect(erfuellt([q("SanH", "Sanitätshelfer")], q("San", "Sanitäter"))).toBe(false);
    expect(erfuellt([q("ZF", "Zugführer")], q("GrF", "Gruppenführer"))).toBe(true);
  });

  it("verschiedene Leitern decken sich nicht", () => {
    expect(erfuellt([q("ZF", "Zugführer")], q("San", "Sanitäter"))).toBe(false);
  });

  it("erkennt die Stufe auch am Namen, wenn das Kürzel abweicht", () => {
    expect(erfuellt([q("RettSan", "Rettungssanitäter")], q("San", "Sanitäter"))).toBe(true);
  });

  it("Leiterlose erfüllen nur sich selbst", () => {
    expect(erfuellt([q("SprF", "Sprechfunker")], q("SprF", "Sprechfunker"))).toBe(true);
    expect(erfuellt([q("SprF", "Sprechfunker")], q("C1", "Fahrer C1"))).toBe(false);
  });

  it("Fahrerlaubnis: C deckt C1, C1 deckt B, B deckt C1 nicht", () => {
    expect(erfuellt([alsFahrerlaubnis("C")], alsFahrerlaubnis("C1"))).toBe(true);
    expect(erfuellt([alsFahrerlaubnis("C1")], alsFahrerlaubnis("B"))).toBe(true);
    expect(erfuellt([alsFahrerlaubnis("B"), alsFahrerlaubnis("BE")], alsFahrerlaubnis("C1"))).toBe(false);
  });
});

describe("qualiKatalog", () => {
  it("Leitern plus Bestand, ohne Doppel", () => {
    const k = qualiKatalog([q("RS", "Rettungssanitäter"), q("SprF", "Sprechfunker"), q("SprF", "Sprechfunker")]);
    expect(k.filter((x) => x.kurz === "SprF")).toHaveLength(1);
    expect(k.filter((x) => x.kurz === "RS")).toHaveLength(1);
    expect(k.some((x) => x.kurz === "NotSan")).toBe(true);
  });
});
