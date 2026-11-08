import { describe, expect, it } from "vitest";
import { unterwegsText } from "./unterwegsText";
import type { OffeneEntnahme, Unterwegs } from "./unterwegs";

const SEIT = Date.UTC(2026, 10, 7, 10);
const teil: OffeneEntnahme = {
  id: "e1", wer: "Helfer A", nutzer: "sub-a", zweck: "Übung Stadtfest", ganz: false, seit: SEIT,
  positionen: [
    { id: "p1", inhaltId: "i1", text: "Patchkabel 10 m", menge: 3, zurueck: 1, offen: 2 },
    { id: "p2", inhaltId: "i2", text: "Blitzschutz", menge: 1, zurueck: 0, offen: 1 },
    { id: "p3", inhaltId: "i3", text: "Schere", menge: 1, zurueck: 1, offen: 0 },
  ],
};
const stand = (entnahmen: OffeneEntnahme[]): Unterwegs => ({ ganz: entnahmen.find((e) => e.ganz) ?? null, jePosition: new Map(), entnahmen });

describe("unterwegsText", () => {
  it("zeigt Teile mit Name und Zweck", () => {
    expect(unterwegsText(stand([teil]), true, true)).toBe("Unterwegs: 2 × Patchkabel 10 m, 1 × Blitzschutz – seit 07.11., Übung Stadtfest, Helfer A");
  });
  it("ganze Kiste", () => {
    expect(unterwegsText(stand([{ ...teil, ganz: true }]), true, true)).toBe("Ganze Kiste unterwegs – seit 07.11., Übung Stadtfest, Helfer A");
  });
  it("ganzes Gerät ohne Kiste", () => {
    expect(unterwegsText(stand([{ ...teil, ganz: true }]), true, false)).toBe("Gerät unterwegs – seit 07.11., Übung Stadtfest, Helfer A");
  });
  it("mehrere Entnahmen mit · getrennt", () => {
    const t = unterwegsText(stand([teil, { ...teil, id: "e2", zweck: "", wer: "B" }]), true, true);
    expect(t?.split(" · ")).toHaveLength(2);
    expect(t).toContain("seit 07.11., B");
  });
  it("ohne Anmeldung ohne Name und Zweck", () => {
    const t = unterwegsText(stand([teil]), false, true);
    expect(t).toBe("Unterwegs: 2 × Patchkabel 10 m, 1 × Blitzschutz – seit 07.11.");
    expect(t).not.toContain("Helfer A");
    expect(t).not.toContain("Stadtfest");
  });
  it("nichts unterwegs → null", () => {
    expect(unterwegsText(stand([]), true, true)).toBeNull();
  });
});
