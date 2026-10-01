import { describe, expect, it } from "vitest";
import { importVorschau } from "./vorschau";

const VORHANDEN = [{ id: "1", typ: "RTW", rufname: "RK UE 40-83-5", zeichen: null, notiz: null }];
describe("importVorschau", () => {
  it("neu, schon in der Bibliothek (anders geschrieben), doppelt in der Liste — übernommen wird nur Neues", () => {
    const r = importVorschau([
      { zeile: 1, typ: "RTW", rufname: " rk ue 40-83-5", notiz: null },
      { zeile: 2, typ: "KTW", rufname: "RK UE 41-92-8", notiz: null },
      { zeile: 3, typ: "KTW", rufname: "RK  UE 41-92-8", notiz: "x" },
    ], VORHANDEN);
    expect(r.zeilen.map((z) => z.status)).toEqual(["vorhanden", "neu", "doppelt"]);
    expect(r.neu).toEqual([{ zeile: 2, typ: "KTW", rufname: "RK UE 41-92-8", notiz: null }]);
  });
});
