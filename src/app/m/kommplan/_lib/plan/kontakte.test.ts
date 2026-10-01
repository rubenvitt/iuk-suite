import { describe, expect, it } from "vitest";
import { KONTAKT_NAME, KONTAKT_REIHENFOLGE, entferneKontakt, kontaktFelder, kontaktZeilen, setzeKontakt, weitererKontakt } from "./kontakte";
import { KONTAKT_ARTEN } from "./schema";

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

describe("Namen der Kontaktarten", () => {
  it("jede Art hat einen deutschen Namen", () => {
    expect(KONTAKT_ARTEN.map((a) => KONTAKT_NAME[a])).toEqual(["Funkrufname", "Digitalfunk", "Telefon", "Mobil", "Fax", "E-Mail", "Sonstiges"]);
  });
});

describe("Kontakte als feste Zeilen je Art (Entscheidung 16)", () => {
  const k = [{ art: "email" as const, wert: "ea1@drk.de" }, { art: "funkrufname" as const, wert: "RK UE 40-00" }];
  it("je Art mindestens ein Feld, in der Reihenfolge der Karte; Doppelte als weitere Felder derselben Art", () => {
    expect(kontaktFelder(k).map((f) => `${f.art}:${f.n}=${f.wert}`)).toEqual([
      "funkrufname:0=RK UE 40-00", "digitalfunk:0=", "telefon:0=", "mobil:0=", "fax:0=", "email:0=ea1@drk.de", "sonstiges:0=",
    ]);
    const doppelt = weitererKontakt(k, "email");
    expect(kontaktFelder(doppelt).filter((f) => f.art === "email").map((f) => [f.n, f.wert, f.vorhanden])).toEqual([[0, "ea1@drk.de", true], [1, "", true]]);
    // ohne Eintrag dieser Art gibt es schon ein (leeres) Feld: nichts anzulegen
    expect(weitererKontakt(k, "telefon")).toBe(k);
  });
  it("Tippen in ein leeres Feld legt an, Leeren des einzigen Eintrags entfernt, sonst wird ersetzt", () => {
    expect(setzeKontakt(k, "telefon", 0, "0581 1")).toEqual([...k, { art: "telefon", wert: "0581 1" }]);
    expect(setzeKontakt(k, "telefon", 0, "")).toBe(k); // leeres Feld bleibt leer: keine Änderung
    expect(setzeKontakt(k, "email", 0, "")).toEqual([k[1]]);
    expect(setzeKontakt(k, "email", 0, "neu@drk.de")).toEqual([{ art: "email", wert: "neu@drk.de" }, k[1]]);
    // bei Doppelten wird ein geleertes Feld nicht entfernt (sonst rutschte das nächste in dieses Feld)
    const doppelt = [...k, { art: "email" as const, wert: "zwei@drk.de" }];
    expect(setzeKontakt(doppelt, "email", 0, "")).toEqual([{ art: "email", wert: "" }, k[1], doppelt[2]]);
    expect(entferneKontakt(doppelt, "email", 1)).toEqual(k);
  });
});
