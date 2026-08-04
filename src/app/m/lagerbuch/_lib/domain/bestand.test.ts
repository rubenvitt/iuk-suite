import { describe, it, expect } from "vitest";
import {
  bestand, bestandProCharge, bestandProLagerort, bestandProLagerortUndCharge,
} from "./bestand";
import { HANDLAGER_ID } from "../konstanten";

/**
 * DIE KONSTELLATION, DIE DAS SCOPING UEBERHAUPT ERST NOETIG MACHT:
 * dieselbe chargeId liegt GLEICHZEITIG im Handlager und in einem Fahrzeug.
 * Ohne Lagerort-Praedikat zaehlte die Handlager-Rechnung den Fahrzeugbestand mit
 * (Phantombestand) — und in einer frisch migrierten Test-DB waere das unsichtbar,
 * weil dort beide Bestaende identisch sind (§5.2.1).
 */
const ZEILEN = [
  { lagerortId: HANDLAGER_ID, chargeId: "c1", menge: 10 },
  { lagerortId: HANDLAGER_ID, chargeId: "c1", menge: -3 },
  { lagerortId: "rtw-1", chargeId: "c1", menge: 4 },   // dieselbe Charge, anderer Ort
  { lagerortId: HANDLAGER_ID, chargeId: "c2", menge: 5 },
  { lagerortId: "rtw-2", chargeId: "c2", menge: 2 },
];

describe("bestand — die Summe ueber eine bereits gefilterte Zeilenmenge", () => {
  it("summiert vorzeichenbehaftet", () => {
    expect(bestand([{ menge: 10 }, { menge: -3 }, { menge: 4 }])).toBe(11);
  });

  it("liefert fuer eine leere Menge 0, nicht undefined", () => {
    // Das ist die Zusage, die beim Wechsel auf SQL bricht: `sum()` liefert bei
    // leerer Gruppe KEINE ZEILE, nicht 0 (§5.2.4, Punkt 3).
    expect(bestand([])).toBe(0);
  });
});

describe("bestandProCharge — Rest je Charge, OHNE Lagerortbezug", () => {
  it("fasst je chargeId zusammen — ueber ALLE Lagerorte", () => {
    // Der schwaechere der beiden Charge-Begriffe. Sein einziger Aufrufer im
    // Bestand filtert VORHER selbst auf einen Lagerort (`queries.ts:31`).
    const m = bestandProCharge(ZEILEN.map((z) => ({ chargeId: z.chargeId, menge: z.menge })));
    expect(m.get("c1")).toBe(11);  // 10 − 3 + 4, Fahrzeug MITGEZAEHLT
    expect(m.get("c2")).toBe(7);
  });
});

describe("bestandProLagerort — der tragende Begriff", () => {
  it("zaehlt NUR den genannten Lagerort", () => {
    expect(bestandProLagerort(ZEILEN, HANDLAGER_ID)).toBe(12);  // 10 − 3 + 5
    expect(bestandProLagerort(ZEILEN, "rtw-1")).toBe(4);
    expect(bestandProLagerort(ZEILEN, "rtw-2")).toBe(2);
  });

  it("liefert fuer einen Lagerort ohne Buchungen 0, NICHT undefined", () => {
    // Dieselbe Bruchstelle wie oben — hier fuer den Fall, den die Fahrzeugliste
    // taeglich trifft: ein frisch angelegtes Fahrzeug hat keine einzige Buchung.
    expect(bestandProLagerort(ZEILEN, "rtw-neu")).toBe(0);
    expect(bestandProLagerort([], HANDLAGER_ID)).toBe(0);
  });
});

describe("bestandProLagerortUndCharge — der Kern-Fix gegen Phantombestand", () => {
  it("fuehrt DIESELBE chargeId an zwei Lagerorten GETRENNT", () => {
    /**
     * DAS IST DIE ZEILE, UM DIE ES GEHT (`bestand.ts:22-24`). Ohne das
     * Lagerort-Praedikat saehe die FEFO-Abbuchung fuer `c1` einen Rest von 11
     * statt 7 — sie buchte mehr ab, als im Handlager liegt, und der
     * Handlager-Bestand wuerde negativ (I2 gebrochen).
     */
    const imHandlager = bestandProLagerortUndCharge(ZEILEN, HANDLAGER_ID);
    expect(imHandlager.get("c1")).toBe(7);   // 10 − 3, OHNE die 4 aus rtw-1
    expect(imHandlager.get("c2")).toBe(5);

    const imRtw = bestandProLagerortUndCharge(ZEILEN, "rtw-1");
    expect(imRtw.get("c1")).toBe(4);
    expect(imRtw.has("c2")).toBe(false);     // c2 liegt in rtw-2, nicht in rtw-1
  });

  it("laesst Chargen ohne Buchung an diesem Ort GANZ weg (kein 0-Eintrag)", () => {
    // Wichtig fuer den Differenztest in T44: das SQL-Aggregat verhaelt sich
    // genauso (keine Zeile statt 0), und beide Seiten gehen deshalb ueber `?? 0`.
    const m = bestandProLagerortUndCharge(ZEILEN, "rtw-1");
    expect([...m.keys()]).toEqual(["c1"]);
  });

  it("liefert fuer einen unbekannten Lagerort eine LEERE Map", () => {
    expect(bestandProLagerortUndCharge(ZEILEN, "gibtsnicht").size).toBe(0);
  });
});
