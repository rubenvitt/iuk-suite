import { describe, expect, it } from "vitest";
import { baue } from "../../_lib/beispiele/bau";
import { leererPlan } from "../../_lib/plan/operationen";
import { wandere } from "./navigation";

const V = [{ id: "v1", art: "tmo" as const, bezeichnung: "R_UE_2" }, { id: "v2", art: "tmo" as const, bezeichnung: "R_UE_3" }];
const plan = baue({
  verbindungen: V,
  stellen: [
    { id: "el", titel: "EL" },
    { id: "l", titel: "KatSL", eltern: "el", lage: "links" },
    { id: "a", titel: "EA 1", eltern: "el", verbindung: "v2" },
    { id: "b", titel: "EA 2", eltern: "el", verbindung: "v1" },
    { id: "c", titel: "EA 3", eltern: "el", verbindung: "v2" },
    { id: "bs", titel: "Seite", eltern: "b", lage: "rechts" },
    { id: "b1", titel: "Trupp", eltern: "b" },
  ],
});
const keine = new Set<string>();

describe("Pfeiltasten im Baum (Entscheidung 9)", () => {
  it("ohne Auswahl: die erste Wurzel; leerer Plan: nichts (Review Focus 1)", () => {
    expect(wandere(plan, keine, null, "rechts")).toBe("el");
    expect(wandere(leererPlan(), keine, null, "runter")).toBeNull();
  });
  it("hoch zur Elternstelle, runter zur ersten Unterstelle in Anzeigereihenfolge", () => {
    // Gruppen unter el: v2 (a, c — kleinste reihenfolge 1) vor v1 (b)
    expect(wandere(plan, keine, "el", "runter")).toBe("a");
    expect(wandere(plan, keine, "b1", "hoch")).toBe("b");
    expect(wandere(plan, keine, "bs", "hoch")).toBe("b");
    expect(wandere(plan, keine, "el", "hoch")).toBe("el");
    expect(wandere(plan, keine, "bs", "runter")).toBe("bs");
  });
  it("links/rechts in Anzeigereihenfolge, Seitenstellen rahmen ihre Stelle ein, kein Umlauf", () => {
    expect(wandere(plan, keine, "a", "rechts")).toBe("c");
    expect(wandere(plan, keine, "c", "rechts")).toBe("b");
    expect(wandere(plan, keine, "b", "rechts")).toBe("bs");
    expect(wandere(plan, keine, "bs", "rechts")).toBe("bs");
    expect(wandere(plan, keine, "el", "links")).toBe("l");
    expect(wandere(plan, keine, "l", "rechts")).toBe("el");
  });
  it("über Kammreihen hinweg: der Nachbar ist das nächste Kind, nicht die nächste Karte derselben Höhe", () => {
    const kamm = baue({
      verbindungen: [V[0]],
      stellen: [{ id: "w", titel: "W" }, ...Array.from({ length: 14 }, (_, i) => ({ id: `k${i}`, titel: `Kind ${i}`, eltern: "w", verbindung: "v1" }))],
    });
    for (let i = 0; i < 13; i++) expect(wandere(kamm, keine, `k${i}`, "rechts")).toBe(`k${i + 1}`);
  });
  it("eingeklappt: runter bleibt stehen; eine versteckte Auswahl springt zur ersten Wurzel", () => {
    const zu = new Set(["b"]);
    expect(wandere(plan, zu, "b", "runter")).toBe("b");
    expect(wandere(plan, zu, "b1", "hoch")).toBe("el");
  });
});
