import { describe, expect, it } from "vitest";
import type { InventurZeile } from "../../../_lib/lesepfade/inventur";
import {
  abweichungFuer, ausbuchenSetzen, istSetzen, neueChargeAendern, stepperCharge,
  abweichungenIn, artikelBestaetigen, artikelSetzen, ausgeblendetGezaehlt, bestaetigungZuruecknehmen,
  chargeSetzen, chargenzaehlungVerwerfen, fortschritt, neueChargeEntfernen, neueChargeHinzufuegen,
  neuSchluessel, positionenAus, summeFuer, type ZaehlStand,
} from "./inventurZustand";

const ZEILE: InventurZeile = {
  id: "a1", name: "Mullbinde", einheit: "Stk", fach: "A1", kategorie: "Hygiene",
  mindestbestand: 5, bestand: 10, ungeordnet: 0,
  chargen: [
    { id: "c1", chargenNr: "L1", verfall: "2026-10", rest: 4, ungeordnet: 0, ampel: "gelb" },
    { id: "c2", chargenNr: "L2", verfall: "2029-01", rest: 6, ungeordnet: 0, ampel: "gruen" },
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

describe("„Stimmt“ (IDA-237)", () => {
  it("übernimmt die Erwartung als Artikelzählung — dieselbe Position wie getippt, keine Abweichung", () => {
    const stand = artikelBestaetigen(LEER, ZEILE);
    expect(stand).toEqual(artikelSetzen(LEER, "a1", 10));
    expect(positionenAus(stand)).toEqual([{ artikelId: "a1", ist: 10 }]);
    expect(abweichungenIn([ZEILE], stand)).toBe(0);
  });

  it("lässt eine schon erfasste Zeile unberührt, auch eine im Chargenmodus", () => {
    const gezaehlt = artikelSetzen(LEER, "a1", 7);
    expect(artikelBestaetigen(gezaehlt, ZEILE)).toBe(gezaehlt);
    const chargen = chargeSetzen(LEER, "a1", "c1", 3);
    expect(artikelBestaetigen(chargen, ZEILE)).toBe(chargen);
  });

  it("nimmt nur eine Bestätigung zurück, nie eine abweichende Zahl oder eine Chargenzählung", () => {
    expect(bestaetigungZuruecknehmen(artikelBestaetigen(LEER, ZEILE), ZEILE)).toEqual({});
    const abweichend = artikelSetzen(LEER, "a1", 7);
    expect(bestaetigungZuruecknehmen(abweichend, ZEILE)).toBe(abweichend);
    const chargen = chargeSetzen(LEER, "a1", "c1", 4);
    expect(bestaetigungZuruecknehmen(chargen, ZEILE)).toBe(chargen);
    expect(bestaetigungZuruecknehmen(LEER, ZEILE)).toBe(LEER);
  });
});

describe("fortschritt (IDA-237)", () => {
  const ZWEITE: InventurZeile = { ...ZEILE, id: "a2", kategorie: "Technik", chargen: [] };

  it("zählt erfasste Zeilen im Umfang, nicht darüber hinaus", () => {
    const stand = artikelSetzen(artikelBestaetigen(LEER, ZEILE), "a2", 3);
    expect(fortschritt([ZEILE, ZWEITE], LEER, { kategorien: [], faecher: [] })).toEqual({ erfasst: 0, gesamt: 2 });
    expect(fortschritt([ZEILE, ZWEITE], stand, { kategorien: [], faecher: [] })).toEqual({ erfasst: 2, gesamt: 2 });
    expect(fortschritt([ZEILE, ZWEITE], stand, { kategorien: ["hygiene"], faecher: [] }))
      .toEqual({ erfasst: 1, gesamt: 1 });
  });
});

describe("Übernahme aus „Nicht zugeordnet“ (IDA-276)", () => {
  /** Vor Schrank 2: im Schrank nichts, auf der Wurzel 30 der einen Charge. */
  const SCHRANK: InventurZeile = {
    id: "k1", name: "Kompresse", einheit: "Stk", fach: "2/2", kategorie: null,
    mindestbestand: 0, bestand: 0, ungeordnet: 30,
    chargen: [{ id: "w1", chargenNr: "Inventur", verfall: "2030-12", rest: 0, ungeordnet: 30, ampel: "gruen" }],
  };

  it("bucht den Rest standardmäßig aus — die Abweichung ist Gezähltes minus Schrank und Wurzel", () => {
    const stand = chargeSetzen(LEER, "k1", "w1", 3);
    expect(abweichungFuer(SCHRANK, stand.k1)).toBe(-27);
    expect(abweichungenIn([SCHRANK], stand)).toBe(1);
    expect(positionenAus(stand, [SCHRANK])).toEqual([{
      artikelId: "k1", chargen: [{ chargeId: "w1", ist: 3, ausbuchen: true }], neu: [],
    }]);
  });

  it("lässt den Rest auf Wunsch stehen — dann ist die Umlagerung keine Abweichung", () => {
    const stand = ausbuchenSetzen(chargeSetzen(LEER, "k1", "w1", 3), "k1", "w1", false);
    expect(abweichungFuer(SCHRANK, stand.k1)).toBe(0);
    expect(abweichungenIn([SCHRANK], stand)).toBe(0);
    expect(positionenAus(stand, [SCHRANK])[0]).toMatchObject({ chargen: [{ chargeId: "w1", ist: 3, ausbuchen: false }] });
    // Zurueck auf die Vorgabe: kein gemerkter Eintrag mehr.
    const zurueck = ausbuchenSetzen(stand, "k1", "w1", true);
    expect(zurueck.k1).toEqual({ art: "chargen", chargen: { w1: 3 }, neu: [] });
  });

  it("setzt den Schalter nur an einer gezählten Charge", () => {
    expect(ausbuchenSetzen(LEER, "k1", "w1", false)).toBe(LEER);
  });

  it("schickt `ausbuchen` nur für Chargen, die auf dieser Seite auf „Nicht zugeordnet“ standen", () => {
    const stand = chargeSetzen(LEER, "a1", "c1", 4);
    expect(positionenAus(stand, [ZEILE])).toEqual([{ artikelId: "a1", chargen: [{ chargeId: "c1", ist: 4 }], neu: [] }]);
  });

  it("zählt mit dem Stepper der Hauptzeile die eine Charge, nicht den Artikel", () => {
    expect(stepperCharge(SCHRANK)?.id).toBe("w1");
    expect(stepperCharge(ZEILE)).toBeUndefined();
    expect(istSetzen(LEER, SCHRANK, 3)).toEqual(chargeSetzen(LEER, "k1", "w1", 3));
    expect(istSetzen(LEER, ZEILE, 3)).toEqual(artikelSetzen(LEER, "a1", 3));
    // Mehrere Chargen: keine richtige Wahl, gezaehlt wird aufgeklappt.
    const zwei = { ...SCHRANK, chargen: [...SCHRANK.chargen, { ...SCHRANK.chargen[0]!, id: "w2" }] };
    expect(stepperCharge(zwei)).toBeUndefined();
  });

  it("„Stimmt“ heißt: Schrank und Wurzel liegen vollständig hier", () => {
    const stand = artikelBestaetigen(LEER, SCHRANK);
    expect(stand.k1).toEqual({ art: "chargen", chargen: { w1: 30 }, neu: [] });
    expect(abweichungFuer(SCHRANK, stand.k1)).toBe(0);
  });
});

describe("Ergänzte Chargen nachträglich ändern (IDA-276)", () => {
  it("ändert Menge, MHD und Nummer an Ort und Stelle", () => {
    const stand = neueChargeHinzufuegen(LEER, "a1", NEU);
    const menge = neueChargeAendern(stand, "a1", NEU.schluessel, { ...NEU, ist: 5 });
    expect(positionenAus(menge)[0]).toMatchObject({ neu: [{ verfall: "2027-03", chargenNr: "", ist: 5 }] });
    const mhd = neueChargeAendern(menge, "a1", NEU.schluessel, {
      schluessel: neuSchluessel("2028-01", "X9"), verfall: "2028-01", chargenNr: "X9", ist: 5,
    });
    expect(positionenAus(mhd)[0]).toMatchObject({ neu: [{ verfall: "2028-01", chargenNr: "X9", ist: 5 }] });
  });

  it("ändert nichts, wenn der neue Schlüssel schon eine andere Ergänzung trägt", () => {
    const zweite = { schluessel: neuSchluessel("2028-01", ""), verfall: "2028-01", chargenNr: "", ist: 1 };
    const stand = neueChargeHinzufuegen(neueChargeHinzufuegen(LEER, "a1", NEU), "a1", zweite);
    expect(neueChargeAendern(stand, "a1", zweite.schluessel, { ...NEU, ist: 9 })).toBe(stand);
    expect(neueChargeAendern(stand, "a1", "gibt-es-nicht", NEU)).toBe(stand);
  });
});
