import { describe, expect, it } from "vitest";
import { pruefungModus, type OffeneEntnahme, type Unterwegs } from "./unterwegs";

const ganz: OffeneEntnahme = { id: "e1", wer: "A", nutzer: "s", zweck: "", ganz: true, seit: 1, positionen: [] };
const u = (ganzE: OffeneEntnahme | null): Unterwegs => ({ ganz: ganzE, jePosition: new Map(), entnahmen: ganzE ? [ganzE] : [] });

describe("pruefungModus", () => {
  it("nichts unterwegs: frei", () => expect(pruefungModus(true, u(null), "e1")).toEqual({ art: "frei" }));
  it("Kiste ganz unterwegs: ohne rueckgabe gesperrt, mit passender rueckgabe Rückgabe", () => {
    expect(pruefungModus(true, u(ganz), undefined)).toEqual({ art: "unterwegs", seit: 1, id: "e1" });
    expect(pruefungModus(true, u(ganz), "fremd")).toMatchObject({ art: "unterwegs" });
    expect(pruefungModus(true, u(ganz), "e1")).toEqual({ art: "rueckgabe", id: "e1" });
  });
  it("Gerät ganz unterwegs: nie Rückgabe über die Prüfung", () => {
    expect(pruefungModus(false, u(ganz), "e1")).toMatchObject({ art: "unterwegs" });
  });
});
