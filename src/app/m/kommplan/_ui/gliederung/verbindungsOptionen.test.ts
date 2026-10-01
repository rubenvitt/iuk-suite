import { describe, expect, it } from "vitest";
import { baue } from "../../_lib/beispiele/bau";
import { LAENGE, VERBINDUNGS_ARTEN } from "../../_lib/plan/schema";
import { KEINE, leseNeu, verbindungsOptionen } from "./verbindungsOptionen";

const PLAN = baue({
  verbindungen: [{ id: "a", art: "tmo", bezeichnung: "R_UE_2" }, { id: "b", art: "dmo", bezeichnung: "DMO 608" }],
  stellen: [{ id: "el", titel: "EL" }],
});

describe("Verbindung inline (Entscheidung 12)", () => {
  it("ohne Suche: „keine“ und alle Verbindungen, mit Art", () => {
    expect(verbindungsOptionen(PLAN, "")).toEqual([
      { value: KEINE, label: "keine (dünne Linie)" },
      { value: "a", label: "R_UE_2 · Digitalfunk TMO" },
      { value: "b", label: "DMO 608 · Digitalfunk DMO" },
    ]);
  });
  it("Suche filtert; neuer Text bietet JE ART eine Option, die zuletzt angelegte Art zuerst", () => {
    const o = verbindungsOptionen(PLAN, "R_UE_3");
    expect(o.filter((x) => leseNeu(x.value) === null)).toEqual([]);
    expect(o.map((x) => leseNeu(x.value))).toEqual(["dmo", ...VERBINDUNGS_ARTEN.filter((a) => a !== "dmo")]);
    expect(o[0].label).toBe("Neu: „R_UE_3“ als Digitalfunk DMO");
  });
  it("gleichnamig vorhanden: diese Art wird nicht noch einmal angeboten (Groß/Klein egal)", () => {
    const o = verbindungsOptionen(PLAN, "r_ue_2");
    expect(o[0]).toEqual({ value: "a", label: "R_UE_2 · Digitalfunk TMO" });
    expect(o.some((x) => leseNeu(x.value) === "tmo")).toBe(false);
    expect(o.some((x) => leseNeu(x.value) === "dmo")).toBe(true);
  });
  it("zu lange Bezeichnung: ein deaktivierter Hinweis statt neuer Optionen", () => {
    const o = verbindungsOptionen(PLAN, "x".repeat(LAENGE.bezeichnung + 1));
    expect(o).toEqual([{ value: "~zu-lang", label: `Höchstens ${LAENGE.bezeichnung} Zeichen`, disabled: true }]);
  });
  it("leseNeu erkennt nur die eigenen Werte", () => {
    expect(leseNeu("~neu:draht")).toBe("draht");
    expect(leseNeu("~neu:quatsch")).toBeNull();
    expect(leseNeu("a")).toBeNull();
  });
  it("Bibliotheksverbindungen, die der Plan nicht hat, stehen als „Aus Bibliothek“ da — gefiltert wie die übrigen", () => {
    const bib = [
      { id: "b1", art: "tmo" as const, bezeichnung: "R_UE_2", notiz: null }, // hat der Plan genau so → keine Option
      { id: "b2", art: "dmo" as const, bezeichnung: "DMO 609", notiz: null }, // hat der Plan nicht → Option
      { id: "b3", art: "tmo" as const, bezeichnung: "DMO 608", notiz: null }, // gleiche Bezeichnung, andere Art → Option
    ];
    const alle = verbindungsOptionen(PLAN, "", bib).map((o) => o.label);
    expect(alle).toContain("Aus Bibliothek: DMO 609 · Digitalfunk DMO");
    expect(alle).toContain("Aus Bibliothek: DMO 608 · Digitalfunk TMO");
    expect(alle.some((l) => l.startsWith("Aus Bibliothek: R_UE_2"))).toBe(false);
    expect(verbindungsOptionen(PLAN, "609", bib).map((o) => o.value)).toContain("~bib:b2");
    expect(verbindungsOptionen(PLAN, "xyz", bib).some((o) => o.value.startsWith("~bib:"))).toBe(false);
  });
});
