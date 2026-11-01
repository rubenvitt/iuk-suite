import { describe, expect, it } from "vitest";
import { offeneAnforderungen, pruefe } from "./pruefung";
import { type EinheitDTO, type PlanHelfer, type PlanungDTO, STUNDE } from "./typen";

const q = (kurz: string, name = kurz) => ({ kurz, name });
const RS = q("RS", "Rettungssanitäter");
const SAN = q("San", "Sanitäter");
const C1 = q("C1", "Fahrer C1");

const helfer = (id: string, ...qualis: { kurz: string; name: string }[]): PlanHelfer =>
  ({ schluessel: `stamm:${id}`, quelle: "stamm", id, vorname: id, nachname: "X", qualifikationen: qualis, demo: false });

const T0 = Date.UTC(2026, 10, 14, 7);
const einheit = (id: string, soll: number, anforderungen: EinheitDTO["anforderungen"] = []): EinheitDTO =>
  ({ id, art: "abschnitt", name: id, fahrzeugId: null, kenner: null, schichtMin: 240, soll, anforderungen, position: 0 });

function planung(teil: Partial<PlanungDTO>): PlanungDTO {
  return { id: "p", name: "P", art: "veranstaltung", ort: "", von: T0, bis: T0 + 24 * STUNDE, maxDienstMin: 720, minRuheMin: 480, einheiten: [], schichten: [], zuordnungen: [], temporaere: [], ...teil };
}

describe("offeneAnforderungen", () => {
  it("eine Person deckt nur eine Anforderung, die strengste zuerst", () => {
    const e = einheit("e", 2, [{ quali: SAN, anzahl: 1 }, { quali: RS, anzahl: 1 }]);
    expect(offeneAnforderungen(e, [helfer("a", RS)])).toEqual([{ quali: SAN, anzahl: 1 }]);
    expect(offeneAnforderungen(e, [helfer("a", RS), helfer("b", SAN)])).toEqual([]);
  });
});

describe("pruefe", () => {
  const A = helfer("a", SAN);
  const B = helfer("b", RS);

  it("Lücke mit fehlender Qualifikation ist kein Konflikt, solange ein Platz frei ist", () => {
    const p = planung({
      einheiten: [einheit("rtw", 2, [{ quali: C1, anzahl: 1 }])],
      schichten: [{ id: "s", einheitId: "rtw", von: T0, bis: T0 + 8 * STUNDE }],
      zuordnungen: [{ schichtId: "s", quelle: "stamm", helferId: "a" }],
    });
    const a = pruefe(p, [A]);
    expect(a.konflikte).toEqual([]);
    expect(a.luecken).toEqual([{ schichtId: "s", fehlen: 1, braucht: [{ quali: C1, anzahl: 1 }] }]);
    expect(a.soll).toBe(2);
    expect(a.ist).toBe(1);
  });

  it("volle Schicht ohne geforderte Qualifikation ist ein Konflikt", () => {
    const p = planung({
      einheiten: [einheit("rtw", 2, [{ quali: C1, anzahl: 1 }])],
      schichten: [{ id: "s", einheitId: "rtw", von: T0, bis: T0 + 8 * STUNDE }],
      zuordnungen: [{ schichtId: "s", quelle: "stamm", helferId: "a" }, { schichtId: "s", quelle: "stamm", helferId: "b" }],
    });
    expect(pruefe(p, [A, B]).konflikte.map((k) => k.art)).toEqual(["quali"]);
  });

  it("überlappende Schichten derselben Person sind doppelt verplant", () => {
    const p = planung({
      einheiten: [einheit("x", 1), einheit("y", 1)],
      schichten: [{ id: "s1", einheitId: "x", von: T0, bis: T0 + 4 * STUNDE }, { id: "s2", einheitId: "y", von: T0 + 2 * STUNDE, bis: T0 + 6 * STUNDE }],
      zuordnungen: [{ schichtId: "s1", quelle: "stamm", helferId: "a" }, { schichtId: "s2", quelle: "stamm", helferId: "a" }],
    });
    const a = pruefe(p, [A]);
    expect(a.konflikte.map((k) => k.art)).toEqual(["doppelt"]);
    expect(a.jeHelfer.get("stamm:a")).toHaveLength(1);
  });

  it("mehr als 12 h ohne 8 h Ruhe ist zu lange im Dienst; 8 h Pause trennt die Dienste", () => {
    const schichten = [
      { id: "s1", einheitId: "x", von: T0, bis: T0 + 8 * STUNDE },
      { id: "s2", einheitId: "x", von: T0 + 12 * STUNDE, bis: T0 + 16 * STUNDE },
    ];
    const zu = (ids: string[]) => ids.map((schichtId) => ({ schichtId, quelle: "stamm" as const, helferId: "a" }));
    const lang = pruefe(planung({ einheiten: [einheit("x", 1)], schichten, zuordnungen: zu(["s1", "s2"]) }), [A]);
    expect(lang.konflikte.map((k) => k.art)).toEqual(["dienst"]);
    expect(lang.dauer.get("stamm:a")).toBe(12 * STUNDE);
    const getrennt = pruefe(planung({ einheiten: [einheit("x", 1)], schichten: [schichten[0], { ...schichten[1], von: T0 + 16 * STUNDE, bis: T0 + 20 * STUNDE }], zuordnungen: zu(["s1", "s2"]) }), [A]);
    expect(getrennt.konflikte).toEqual([]);
  });
});
