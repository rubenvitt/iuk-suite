import { describe, expect, it } from "vitest";
import { pruefungEingabe } from "./eingabe";

const punkt = "3c4eb323-0000-4000-8000-000000000001";
const basis = { stunden: null, ergebnis: "mangel", notiz: "" } as const;

describe("pruefungEingabe", () => {
  it("weist einen doppelten Punkt der Checkliste ab", () => {
    const zweimal = [{ punktId: punkt, ok: false, text: "Riss" }, { punktId: punkt, ok: true, text: "" }];
    expect(pruefungEingabe.safeParse({ ...basis, antworten: zweimal }).success).toBe(false);
    expect(pruefungEingabe.safeParse({ ...basis, antworten: zweimal.slice(0, 1) }).success).toBe(true);
  });
});
