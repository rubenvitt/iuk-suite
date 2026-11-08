import { describe, expect, it } from "vitest";
import { einsatzText, mitAnlassKnopf, unterwegsText } from "./unterwegsText";
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
    expect(unterwegsText(stand([teil]), true)).toBe("Unterwegs: 2 × Patchkabel 10 m, 1 × Blitzschutz – seit 07.11., Übung Stadtfest, Helfer A");
  });
  it("ganze Kiste", () => {
    expect(unterwegsText(stand([{ ...teil, ganz: true }]), true)).toBe("Ganze Kiste unterwegs – seit 07.11., Übung Stadtfest, Helfer A");
  });
  it("mehrere Entnahmen mit · getrennt", () => {
    const t = unterwegsText(stand([teil, { ...teil, id: "e2", zweck: "", wer: "B" }]), true);
    expect(t?.split(" · ")).toHaveLength(2);
    expect(t).toContain("seit 07.11., B");
  });
  it("ohne Anmeldung ohne Name und Zweck", () => {
    const t = unterwegsText(stand([teil]), false);
    expect(t).toBe("Unterwegs: 2 × Patchkabel 10 m, 1 × Blitzschutz – seit 07.11.");
    expect(t).not.toContain("Helfer A");
    expect(t).not.toContain("Stadtfest");
  });
  it("nichts unterwegs → null", () => {
    expect(unterwegsText(stand([]), true)).toBeNull();
  });
});

describe("einsatzText", () => {
  it("mit Anmeldung mit Namen", () => expect(einsatzText({ seit: SEIT, wer: "Helfer A" }, true)).toBe("Im Einsatz seit 07.11., Helfer A"));
  it("ohne Anmeldung ohne Namen", () => expect(einsatzText({ seit: SEIT, wer: "Helfer A" }, false)).toBe("Im Einsatz seit 07.11."));
});

describe("mitAnlassKnopf", () => {
  const anlass = { vorlage: { anlass: "einsatz" as const } };
  const frist = { vorlage: { anlass: null } };
  it("ein Gerät mit Prüfart auf Anlass bekommt „Wird eingesetzt“", () => expect(mitAnlassKnopf({ kiste: false, imEinsatz: false, staende: [frist, anlass] })).toBe(true));
  it("ein Gerät ohne Prüfart auf Anlass nicht", () => expect(mitAnlassKnopf({ kiste: false, imEinsatz: false, staende: [frist] })).toBe(false));
  it("ein Gerät im Einsatz behält „Zurück“, auch wenn seine Prüfart auf Anlass inzwischen weg ist", () =>
    expect(mitAnlassKnopf({ kiste: false, imEinsatz: true, staende: [frist] })).toBe(true));
  it("eine Kiste nie, sie geht über Entnehmen und Zurücklegen", () => expect(mitAnlassKnopf({ kiste: true, imEinsatz: true, staende: [frist, anlass] })).toBe(false));
});
