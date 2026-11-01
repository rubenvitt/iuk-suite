import { describe, expect, it } from "vitest";
import { pruefe } from "../_lib/pruefung";
import type { PlanHelfer, PlanungDTO } from "../_lib/typen";
import { STUNDE } from "../_lib/typen";
import { dateiname, eintraege, planungsMappe } from "./export";

const T0 = Date.UTC(2026, 10, 14, 7);
const h = (id: string, vorname: string, nachname: string, quelle: "stamm" | "temp" = "stamm"): PlanHelfer =>
  ({ schluessel: `${quelle}:${id}`, quelle, id, vorname, nachname, qualifikationen: [], demo: true, organisation: quelle === "temp" ? "Nachbarkreis" : undefined });
const helfer = [h("a", "Anna", "Albers"), h("b", "Ben", "Brandt"), h("t", "Erika", "Beispiel", "temp")];
const p: PlanungDTO = {
  id: "p", name: "Stadtfest Ärger & Co", art: "veranstaltung", ort: "Markt", von: T0, bis: T0 + 8 * STUNDE, maxDienstMin: 720, minRuheMin: 480,
  einheiten: [{ id: "e", art: "abschnitt", name: "Wache", fahrzeugId: null, kenner: null, schichtMin: 240, soll: 2, anforderungen: [], position: 0 }],
  schichten: [{ id: "s2", einheitId: "e", von: T0 + 4 * STUNDE, bis: T0 + 8 * STUNDE }, { id: "s1", einheitId: "e", von: T0, bis: T0 + 4 * STUNDE }],
  zuordnungen: [{ schichtId: "s1", quelle: "stamm", helferId: "b" }, { schichtId: "s1", quelle: "temp", helferId: "t" }, { schichtId: "s2", quelle: "stamm", helferId: "a" }],
  temporaere: [],
};

describe("Excel-Mappe der Planung", () => {
  it("Schichten zeitlich, Personen nach Nachnamen", () => {
    expect(eintraege(p, helfer).map((x) => [x.s.id, x.personen.map((y) => y.nachname)])).toEqual([["s1", ["Beispiel", "Brandt"]], ["s2", ["Albers"]]]);
  });

  it("vier Blätter, je Helfer mit Herkunft und Stunden", () => {
    const mappe = planungsMappe(p, pruefe(p, helfer), helfer);
    expect(mappe.map((b) => b.name)).toEqual(["Planung", "Je Abschnitt", "Je Helfer", "Konflikte"]);
    const jeHelfer = mappe[2].daten.slice(1).map((z) => z.map((c) => c?.value ?? null));
    expect(jeHelfer.map((z) => [z[0], z[1], z[5]])).toEqual([["Albers, Anna", "Stammdaten", 4], ["Beispiel, Erika", "Temporär (Nachbarkreis)", 4], ["Brandt, Ben", "Stammdaten", 4]]);
  });

  it("Dateiname ohne Umlaute und Sonderzeichen", () => {
    expect(dateiname(p, "2026-11-14")).toBe("schichtplan-stadtfest-aerger-co-2026-11-14.xlsx");
  });
});
