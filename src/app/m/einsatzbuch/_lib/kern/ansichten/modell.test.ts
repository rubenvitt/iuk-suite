import { describe, expect, it } from "vitest";
import erwartetJson from "../testvektoren/erwartet.json";
import { TESTEINSAETZE } from "../testvektoren/einsaetze";
import type { Block } from "../format";
import { chipText, einsatzTexte, kettenzustandAus, knotenFuer, pruefSatz } from "./modell";

const bloecke = (erwartetJson as unknown as { bloecke: Block[] }).bloecke;

describe("Kettenzustand", () => {
  it("vollständig", () => {
    const z = kettenzustandAus({ ok: true, vollstaendig: true }, bloecke);
    expect(chipText(z)).toBe("Kette intakt");
    expect(pruefSatz(z)).toBe("Alle Blöcke passen zu ihrem Fingerabdruck und bauen lückenlos auf dem Anfang der Kette auf.");
  });
  it("Ausschnitt ab Block 2 nennt den fehlenden Vorgänger", () => {
    const z = kettenzustandAus({ ok: true, vollstaendig: false }, bloecke.slice(1));
    expect(chipText(z)).toBe("Ausschnitt intakt");
    expect(pruefSatz(z)).toBe(`Ausschnitt ab Block 2: Die enthaltenen Blöcke passen zusammen. Der Vorgänger #${bloecke[0].hash.slice(0, 8)} ist nicht in der Datei.`);
  });
  it("gebrochen: Chip, Satz und Knoten", () => {
    const z = kettenzustandAus({ ok: false, block: 2, grund: "Inhalt passt nicht zum Fingerabdruck" }, bloecke);
    expect(chipText(z)).toBe("Gebrochen bei Block 2");
    expect(pruefSatz(z)).toBe("Block 2: Inhalt passt nicht zum Fingerabdruck. Die Datei wurde nach dem Export verändert oder ist beschädigt.");
    expect([1, 2, 3].map((b) => knotenFuer(b, z))).toEqual(["geprueft", "gebrochen", "neutral"]);
  });
  it("ungeprüft, laufend und intakt mit Prüfzeit (Verwaltung)", () => {
    expect(chipText({ art: "ungeprueft" })).toBe("Noch nicht geprüft");
    expect(chipText({ art: "laeuft", i: 2, n: 5 })).toBe("Prüfe Block 2 von 5 …");
    expect(chipText({ art: "intakt", vollstaendig: true, zeit: "14:02" })).toBe("Kette intakt · geprüft 14:02 Uhr");
    expect(pruefSatz({ art: "ungeprueft" })).toBe("");
    expect(knotenFuer(1, { art: "laeuft", i: 1, n: 3 })).toBe("neutral");
    expect(knotenFuer(3, { art: "intakt", vollstaendig: true })).toBe("geprueft");
  });
});

describe("einsatzTexte (dieselben Regeln wie bericht())", () => {
  it("abgeschlossener Einsatz", () => {
    expect(einsatzTexte(TESTEINSAETZE[2], "Europe/Berlin")).toEqual({
      ort: "B4, Abfahrt Uelzen-Nord, 29525 Uelzen",
      objekt: "VU Reisebus / Pkw",
      beginn: "23.9.2026, 18:42 Uhr",
      ende: "23.9.2026, 21:05 Uhr",
      dauer: "2 h 23 min",
    });
  });
  it("offenes Ende, leeres Objekt, negative Dauer", () => {
    const offen = einsatzTexte(TESTEINSAETZE[1], "Europe/Berlin");
    expect(offen.ende).toBe("nicht angegeben");
    expect(offen.dauer).toBe("—");
    expect(einsatzTexte(TESTEINSAETZE[0], "Europe/Berlin").objekt).toBe("—");
    const rueckwaerts = { ...TESTEINSAETZE[2], endeZeit: "17:00" };
    expect(einsatzTexte(rueckwaerts, "Europe/Berlin").dauer).toBe("—");
    expect(einsatzTexte({ ...TESTEINSAETZE[2], strasse: "", ort: "" }, "Europe/Berlin").ort).toBe("—");
  });
});
