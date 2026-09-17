import { describe, expect, it } from "vitest";
import { gruppiereNachOrt } from "./gruppierung";
import type { OrtVerfallZeile } from "./OrtVerfallTabelle";

function zeile(teil: Partial<OrtVerfallZeile> = {}): OrtVerfallZeile {
  return {
    schluessel: "f1:a1",
    ortId: "f1",
    ortName: "RTW Nord",
    ortKennung: "UE-RK 1234",
    ortTyp: "fahrzeug" as const,
    ortEinheitenart: "fahrzeug" as const,
    artikelName: "Verband",
    verfall: "2026-08",
    verfallText: "08/26",
    statusTon: "gelb",
    statusText: "läuft ab",
    abgelaufen: false,
    gemeldetText: "01.06.2026",
    ...teil,
  };
}

describe("gruppiereNachOrt", () => {
  it("fasst die Meldungen eines Fahrzeugs unter EINER Elternzeile zusammen", () => {
    const gruppen = gruppiereNachOrt([
      zeile({ schluessel: "f1:a1", artikelName: "Verband" }),
      zeile({ schluessel: "f2:a1", ortId: "f2", ortName: "RTW Süd",
              ortKennung: "UE-RK 5678" }),
      zeile({ schluessel: "f1:a2", artikelName: "NaCl" }),
    ]);

    expect(gruppen).toHaveLength(2);
    expect(gruppen[0].ortId).toBe("f1");
    expect(gruppen[0].children.map((k) => k.artikelName)).toEqual(["Verband", "NaCl"]);
    expect(gruppen[1].children).toHaveLength(1);
  });

  /**
   * ⚠️ DER SCHLUESSEL DER ELTERNZEILE DARF MIT KEINEM KINDSCHLUESSEL
   * ZUSAMMENFALLEN. Beide landen in DERSELBEN `rowKey`-Menge von rc-table;
   * eine Kollision liesse React zwei Zeilen fuer dieselbe halten — und
   * `[data-row-key]`, der einzige Greifer, der beide Betriebsarten ueberlebt
   * (Falle 14), traefe dann auf zwei Knoten.
   *
   * Ein Kindschluessel ist `<lagerortId>:<artikelId>`; das Praefix macht den
   * Elternschluessel dagegen unverwechselbar.
   */
  it("gibt der Elternzeile einen Schlüssel, der mit keinem Kind kollidiert", () => {
    const gruppen = gruppiereNachOrt([zeile({ schluessel: "f1:a1" })]);
    const alle = [gruppen[0].schluessel, ...gruppen[0].children.map((k) => k.schluessel)];

    expect(new Set(alle).size).toBe(alle.length);
    expect(gruppen[0].schluessel).not.toBe("f1:a1");
  });

  /**
   * ⚠️ DIE BILANZ WIRD GEZAEHLT, NICHT GERATEN — und abgelaufen schlaegt die
   * Ampel. `abgelaufen` und „rot" sind NICHT dasselbe (`domain/verfall.ts`):
   * eine abgelaufene Meldung ist immer rot, eine rote nicht immer abgelaufen.
   * Wer `warnend` als „Ton ist nicht ok" rechnet, zaehlt jede abgelaufene
   * Meldung in BEIDEN Zahlen.
   */
  it("zählt abgelaufen und warnend überschneidungsfrei", () => {
    const [gruppe] = gruppiereNachOrt([
      zeile({ schluessel: "f1:a1", abgelaufen: true, statusTon: "rot",
              statusText: "abgelaufen" }),
      zeile({ schluessel: "f1:a2", abgelaufen: true, statusTon: "rot",
              statusText: "abgelaufen" }),
      zeile({ schluessel: "f1:a3", abgelaufen: false, statusTon: "gelb" }),
    ]);

    expect(gruppe.abgelaufen).toBe(2);
    expect(gruppe.warnend).toBe(1);
  });

  /**
   * ⚠️ DIE REIHENFOLGE DER FAHRZEUGE FOLGT DER DRINGLICHKEIT, NICHT DEM
   * ALPHABET. Zugeklappt sieht man nur die Elternzeilen — steht ein Fahrzeug
   * mit zwei abgelaufenen Artikeln unter einem mit einer bald ablaufenden
   * Packung, hat die Gruppierung ihren Zweck verfehlt. Innerhalb gleicher
   * Dringlichkeit entscheidet der Name.
   */
  it("stellt Fahrzeuge mit Abgelaufenem nach oben", () => {
    const gruppen = gruppiereNachOrt([
      zeile({ schluessel: "a:1", ortId: "a", ortName: "AAA Nur Warnend" }),
      zeile({ schluessel: "z:1", ortId: "z", ortName: "ZZZ Abgelaufen",
              abgelaufen: true, statusTon: "rot", statusText: "abgelaufen" }),
      zeile({ schluessel: "m:1", ortId: "m", ortName: "MMM Nur Warnend" }),
    ]);

    expect(gruppen.map((g) => g.ortId)).toEqual(["z", "a", "m"]);
  });

  it("liefert für eine leere Liste keine Gruppe", () => {
    expect(gruppiereNachOrt([])).toEqual([]);
  });

  /**
   * ⚠️ GRUPPIERT WIRD UEBER DIE ID, NICHT UEBER DEN NAMEN. `lagerorte.name`
   * traegt keinen Unique-Index — zwei „MTW" sind erlaubt. Ueber den Namen
   * gefaltet verschmelzen ihre Meldungen zu EINER Gruppe, und die Bilanz
   * darueber ist die Summe zweier Fahrzeuge.
   */
  it("wirft zwei gleichnamige Fahrzeuge NICHT zusammen", () => {
    const gruppen = gruppiereNachOrt([
      zeile({ schluessel: "mtw-a:1", ortId: "mtw-a", ortName: "MTW",
              ortKennung: null }),
      zeile({ schluessel: "mtw-b:1", ortId: "mtw-b", ortName: "MTW",
              ortKennung: null }),
    ]);

    expect(gruppen).toHaveLength(2);
  });
});
