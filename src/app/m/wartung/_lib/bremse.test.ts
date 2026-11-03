import { describe, expect, it } from "vitest";
import { meldungOhneAnmeldungErlaubt } from "./bremse";

describe("Notbremse für Meldungen ohne Anmeldung", () => {
  it("deckelt je Gerät, andere Geräte bleiben offen", () => {
    const erlaubt = Array.from({ length: 7 }, () => meldungOhneAnmeldungErlaubt("geraet-a"));
    expect(erlaubt).toEqual([true, true, true, true, true, false, false]);
    expect(meldungOhneAnmeldungErlaubt("geraet-b")).toBe(true);
  });
});
