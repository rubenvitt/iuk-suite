import { describe, expect, it } from "vitest";
import { KONTAKT_REIHENFOLGE, kontaktZeilen } from "./kontakte";

describe("kontaktZeilen", () => {
  it("feste Reihenfolge wie in der Vorlage, unabhängig von der Eingabe", () => {
    expect(kontaktZeilen([{ art: "email", wert: "a@b" }, { art: "funkrufname", wert: "RK UE 40-00" }], false))
      .toEqual([{ art: "funkrufname", wert: "RK UE 40-00" }, { art: "email", wert: "a@b" }]);
  });
  it("mehrere Werte derselben Art behalten ihre Eingabereihenfolge", () => {
    expect(kontaktZeilen([{ art: "telefon", wert: "1" }, { art: "telefon", wert: "2" }], false).map((z) => z.wert)).toEqual(["1", "2"]);
  });
  it("mit Leerzeilen: je Art eine Zeile (außer Sonstiges), leere Werte bleiben leer", () => {
    const z = kontaktZeilen([{ art: "telefon", wert: "0581 / 82 266" }], true);
    expect(z.map((x) => x.art)).toEqual(["funkrufname", "digitalfunk", "telefon", "mobil", "fax", "email"]);
    expect(z[2].wert).toBe("0581 / 82 266");
    expect(z[0].wert).toBe("");
  });
  it("leere und nur aus Leerzeichen bestehende Werte zählen nicht als belegt", () => {
    expect(kontaktZeilen([{ art: "fax", wert: "   " }], false)).toEqual([]);
  });
  it("Sonstiges steht zuletzt", () => expect(KONTAKT_REIHENFOLGE.at(-1)).toBe("sonstiges"));
});
