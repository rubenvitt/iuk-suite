import { describe, expect, it } from "vitest";
import type { Faelligkeit } from "@/core/faelligkeiten";
import { ALLE_FAELLIGKEITEN, filtereGruppen, sortiereFaelligkeiten, woAnzeige } from "./anzeige";
import type { FaelligkeitsGruppe } from "./sammeln";

const f = (id: string, dringlichkeit: Faelligkeit["dringlichkeit"], sortierung: string): Faelligkeit => ({
  id, art: "Verfall", titel: id, wo: null, zustand: "", dringlichkeit, sortierung, pfad: "/",
});

describe("sortiereFaelligkeiten", () => {
  it("überfällig vor bald, dann früheste Frist, „sofort“ (leer) ganz vorn — auf einer Kopie", () => {
    const roh = [f("b2", "bald", "2026-08"), f("u2", "ueberfaellig", "2026-05"), f("b1", "bald", "2026-07"), f("u1", "ueberfaellig", "")];
    expect(sortiereFaelligkeiten(roh).map((x) => x.id)).toEqual(["u1", "u2", "b1", "b2"]);
    expect(roh[0].id).toBe("b2");
  });
});

describe("woAnzeige", () => {
  it("lässt den Ort weg, wenn er schon im Titel steht", () => {
    expect(woAnzeige({ titel: "Accu-Chek Guide (KTW 1)", wo: "KTW 1" })).toBeNull();
    expect(woAnzeige({ titel: "NaCl", wo: "RTW 1" })).toBe("RTW 1");
    expect(woAnzeige({ titel: "NaCl", wo: null })).toBeNull();
  });
});

describe("filtereGruppen (IDA-391)", () => {
  const gruppe = (modul: string, eintraege: Faelligkeit[], fehler = false): FaelligkeitsGruppe => ({
    modul, titel: modul, basisUrl: null, eintraege, fehler,
  });
  const GRUPPEN = [
    gruppe("lagerbuch", [f("u1", "ueberfaellig", ""), f("b1", "bald", "2026-12")]),
    gruppe("radio", [f("b2", "bald", "2026-12")]),
    gruppe("wartung", [], true),
  ];
  const ALLE = ALLE_FAELLIGKEITEN;

  it("ohne Filter bleibt alles, wie es ist", () => {
    expect(filtereGruppen(GRUPPEN, { modul: ALLE, dringlichkeit: ALLE })).toEqual(GRUPPEN);
  });

  it("filtert nach Modul", () => {
    expect(filtereGruppen(GRUPPEN, { modul: "radio", dringlichkeit: ALLE }).map((g) => g.modul)).toEqual(["radio"]);
  });

  it("filtert nach Dringlichkeit, lässt dadurch leere Gruppen weg und behält ausgefallene", () => {
    const ueber = filtereGruppen(GRUPPEN, { modul: ALLE, dringlichkeit: "ueberfaellig" });
    expect(ueber.map((g) => [g.modul, g.eintraege.map((e) => e.id)])).toEqual([["lagerbuch", ["u1"]], ["wartung", []]]);
    expect(filtereGruppen(GRUPPEN, { modul: "radio", dringlichkeit: "ueberfaellig" })).toEqual([]);
  });
});
