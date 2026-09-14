import { describe, expect, it } from "vitest";
import type { InventurZeile } from "../../../_lib/lesepfade/inventur";
import {
  abweichungenIn, artikelSetzen, ausgeblendetGezaehlt, chargeSetzen, chargenzaehlungVerwerfen,
  neueChargeEntfernen, neueChargeHinzufuegen, neuSchluessel, positionenAus, summeFuer, type ZaehlStand,
} from "./inventurZustand";

const ZEILE: InventurZeile = {
  id: "a1", name: "Mullbinde", einheit: "Stk", fach: "A1", kategorie: "Hygiene",
  mindestbestand: 5, bestand: 10,
  chargen: [
    { id: "c1", chargenNr: "L1", verfall: "2026-10", rest: 4, ampel: "gelb" },
    { id: "c2", chargenNr: "L2", verfall: "2029-01", rest: 6, ampel: "gruen" },
  ],
};
const LEER: ZaehlStand = {};
const NEU = { schluessel: neuSchluessel("2027-03", ""), verfall: "2027-03", chargenNr: "", ist: 2 };

describe("positionenAus — nur Angefasstes", () => {
  it("sendet eine Artikelposition wörtlich als { artikelId, ist }, auch unverändert und 0", () => {
    expect(positionenAus(artikelSetzen(artikelSetzen(LEER, "a1", 10), "a2", 0)))
      .toEqual([{ artikelId: "a1", ist: 10 }, { artikelId: "a2", ist: 0 }]);
    expect(positionenAus(LEER)).toEqual([]);
  });

  it("sendet im Chargenmodus nur angefasste Chargen und die Ergänzungen", () => {
    const stand = neueChargeHinzufuegen(chargeSetzen(LEER, "a1", "c2", 5), "a1", NEU);
    expect(positionenAus(stand)).toEqual([{
      artikelId: "a1",
      chargen: [{ chargeId: "c2", ist: 5 }],
      neu: [{ verfall: "2027-03", chargenNr: "", ist: 2 }],
    }]);
  });

  it("verwirft den Artikelwert, sobald eine Charge angefasst wird", () => {
    const stand = chargeSetzen(artikelSetzen(LEER, "a1", 3), "a1", "c1", 4);
    expect(positionenAus(stand)).toEqual([{ artikelId: "a1", chargen: [{ chargeId: "c1", ist: 4 }], neu: [] }]);
  });

  it("setzt nach dem Verwerfen und nach dem Entfernen der letzten Ergänzung auf unberührt zurück", () => {
    expect(positionenAus(chargenzaehlungVerwerfen(chargeSetzen(LEER, "a1", "c1", 1), "a1"))).toEqual([]);
    expect(positionenAus(neueChargeEntfernen(neueChargeHinzufuegen(LEER, "a1", NEU), "a1", NEU.schluessel)))
      .toEqual([]);
  });

  it("ignoriert artikelSetzen im Chargenmodus — das Feld ist dort nur Summe", () => {
    const stand = artikelSetzen(chargeSetzen(LEER, "a1", "c1", 1), "a1", 99);
    expect(stand.a1).toMatchObject({ art: "chargen" });
  });
});

describe("summeFuer und Abweichungen", () => {
  it("summiert gezählte, NICHT angefasste (mit Rest) und ergänzte Chargen", () => {
    const stand = neueChargeHinzufuegen(chargeSetzen(LEER, "a1", "c1", 1), "a1", NEU);
    expect(summeFuer(ZEILE, stand.a1)).toBe(1 + 6 + 2);
    expect(summeFuer(ZEILE, undefined)).toBe(10);
    expect(summeFuer(ZEILE, { art: "artikel", ist: 7 })).toBe(7);
  });

  it("zählt Abweichungen je Position wie der Server", () => {
    const stand = neueChargeHinzufuegen(chargeSetzen(chargeSetzen(LEER, "a1", "c1", 4), "a1", "c2", 5), "a1", NEU);
    // c1 = Rest → keine; c2 weicht ab; die Ergänzung weicht immer ab (erwartet 0, ist ≥ 1)
    expect(abweichungenIn([ZEILE], stand)).toBe(2);
  });

  it("zählt gezählte Zeilen, die der Filter ausblendet", () => {
    const stand = artikelSetzen(LEER, "a1", 3);
    expect(ausgeblendetGezaehlt([ZEILE], stand, { kategorien: [], faecher: ["B9"] })).toBe(1);
    expect(ausgeblendetGezaehlt([ZEILE], stand, { kategorien: [], faecher: [] })).toBe(0);
  });
});
