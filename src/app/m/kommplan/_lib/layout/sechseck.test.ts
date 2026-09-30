import { describe, expect, it } from "vitest";
import { SCHRIFT, SECHSECK } from "./masse";
import { sechseckForm, sechseckMass } from "./sechseck";
import { textBreite } from "./text";

describe("Sechseck", () => {
  it("Breite zwischen 26 und 44 mm, wächst mit der Beschriftung", () => {
    const kurz = sechseckMass({ id: "v", art: "tmo", bezeichnung: "R_UE_2" });
    const lang = sechseckMass({ id: "v", art: "tmo", bezeichnung: "BOS_NI_RES_09" });
    expect(kurz.breite).toBeGreaterThanOrEqual(SECHSECK.minBreite);
    expect(lang.breite).toBeGreaterThan(kurz.breite);
    expect(lang.breite).toBeLessThanOrEqual(SECHSECK.maxBreite);
  });
  it("eine überlange Bezeichnung wird mit … gekürzt und passt hinein", () => {
    const s = sechseckMass({ id: "v", art: "dmo", bezeichnung: "Stabsfunk Kreisverwaltung Uelzen Ausweichkanal" });
    expect(s.breite).toBe(SECHSECK.maxBreite);
    expect(s.beschriftung.text.endsWith("…")).toBe(true);
    expect(textBreite(s.beschriftung.text, SCHRIFT.sechseck, true)).toBeLessThan(SECHSECK.maxBreite - 16 + 1e-9);
    expect(s.voll).toBe("Stabsfunk Kreisverwaltung Uelzen Ausweichkanal");
  });
  it("Form je Art: Funk, Leitung, Mobil", () => {
    expect(["tmo", "dmo", "analogfunk"].map((a) => sechseckForm(a as never))).toEqual(["funk", "funk", "funk"]);
    expect(["draht", "telefon", "fax", "daten"].map((a) => sechseckForm(a as never))).toEqual(["leitung", "leitung", "leitung", "leitung"]);
    expect(sechseckForm("mobil")).toBe("mobil");
  });
  it("trägt das Piktogramm seiner Art", () => {
    expect(sechseckMass({ id: "v", art: "draht", bezeichnung: "" }).piktogramm).toBe("comms.cable-construction");
  });
});
