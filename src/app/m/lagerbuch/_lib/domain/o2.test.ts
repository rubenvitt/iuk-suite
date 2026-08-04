import { describe, it, expect } from "vitest";
import { fuellstandProzent, o2Status, O2_AMPEL_ROT_PROZENT, O2_AMPEL_GELB_PROZENT } from "./o2";

describe("fuellstandProzent", () => {
  it("rundet auf ganze Prozent", () => {
    expect(fuellstandProzent(150, 200)).toBe(75);
    expect(fuellstandProzent(100, 300)).toBe(33); // 33,33 → 33
    expect(fuellstandProzent(200, 300)).toBe(67); // 66,67 → 67
  });

  it("klemmt NICHT auf 100 — Ueberfuellung bleibt sichtbar", () => {
    // Ein `Progress`, der bei 100 deckelt, verliert diese Aussage (§5.12,
    // Eigenschaft 1). Das ist eine Auflage an die Darstellung (Teil 5), aber die
    // ZAHL entsteht hier.
    expect(fuellstandProzent(220, 200)).toBe(110);
  });

  it("liefert bei nenn <= 0 genau 0 — kein Fehler, keine Division durch null", () => {
    expect(fuellstandProzent(150, 0)).toBe(0);
    expect(fuellstandProzent(150, -50)).toBe(0);
  });

  it("liefert bei Druck 0 genau 0", () => {
    expect(fuellstandProzent(0, 200)).toBe(0);
  });
});

describe("o2Status — die zwei Schwellen an ihren KANTEN", () => {
  it("24 % ist rot, 25 % ist gelb", () => {
    // `< 25` → rot. Die Kante gehoert zu GELB, nicht zu rot.
    expect(o2Status(48, 200).prozent).toBe(24);
    expect(o2Status(48, 200).ampel).toBe("rot");
    expect(o2Status(50, 200).prozent).toBe(25);
    expect(o2Status(50, 200).ampel).toBe("gelb");
  });

  it("49 % ist gelb, 50 % ist gruen", () => {
    expect(o2Status(98, 200).prozent).toBe(49);
    expect(o2Status(98, 200).ampel).toBe("gelb");
    expect(o2Status(100, 200).prozent).toBe(50);
    expect(o2Status(100, 200).ampel).toBe("gruen");
  });

  it("die Schwellen stehen als benannte Konstanten und tragen ihre Einheit", () => {
    expect(O2_AMPEL_ROT_PROZENT).toBe(25);
    expect(O2_AMPEL_GELB_PROZENT).toBe(50);
  });
});

describe("o2Status — `niedrig` ist genau `ampel === 'rot'`", () => {
  it("ist wahr bei rot und falsch sonst", () => {
    expect(o2Status(40, 200).niedrig).toBe(true);
    expect(o2Status(60, 200).niedrig).toBe(false);
    expect(o2Status(150, 200).niedrig).toBe(false);
  });

  it("ist bei nenn <= 0 WAHR — 0 % ist rot", () => {
    // Der Grenzfall, den die Zaehler `flaschenAuffaellig` sehen: eine Flasche mit
    // Nennfuelldruck 0 im Stamm zaehlt als auffaellig. Das ist richtig — sie ist
    // fehlkonfiguriert und gehoert angesehen. Zu unterscheiden vom Fall
    // „Nennfuelldruck UNBEKANNT" (§5.12), der gar nicht erst hier ankommt.
    expect(o2Status(150, 0)).toEqual({ prozent: 0, ampel: "rot", niedrig: true });
  });
});
