import { describe, expect, it } from "vitest";
import {
  fachNormalisieren,
  gesetzteFelder,
  idBloecke,
  SAMMEL_FELDER,
  SAMMEL_FELDNAMEN,
  sammelAenderungBauen,
  sammelVorschau,
  sammelWertText,
  type SammelZeile,
} from "./sammelAenderung";

function zeile(werte: Partial<SammelZeile> = {}): SammelZeile {
  return {
    id: "art-1",
    name: "Mullbinde",
    kategorie: "Verbandmaterial",
    fach: "A-01",
    aktiv: true,
    ...werte,
  };
}

describe("SAMMEL_FELDER", () => {
  it("hat für jedes Feld einen Namen und keinen darüber hinaus", () => {
    expect(Object.keys(SAMMEL_FELDNAMEN).sort()).toEqual([...SAMMEL_FELDER].sort());
  });

  it("enthält weder Einheit noch Mindestbestand noch Name", () => {
    // Die Auswahl ist die Entscheidung des Tickets, nicht eine Reihenfolge.
    expect(SAMMEL_FELDER).toEqual(["kategorie", "fach", "aktiv"]);
  });
});

describe("gesetzteFelder", () => {
  it("meldet nur, was gesetzt ist", () => {
    expect(gesetzteFelder({ fach: "B-02" })).toEqual(["fach"]);
    expect(gesetzteFelder({})).toEqual([]);
  });

  it("zählt „ohne Kategorie“ als gesetztes Feld", () => {
    // `null` ist ein Zielwert, `undefined` ist keiner — genau diese
    // Unterscheidung trägt die ganze Aktion.
    expect(gesetzteFelder({ kategorie: null })).toEqual(["kategorie"]);
  });

  it("liefert die Felder in Anzeigereihenfolge, nicht in Eingabereihenfolge", () => {
    expect(gesetzteFelder({ aktiv: false, fach: "B-02", kategorie: "Hygiene" }))
      .toEqual(["kategorie", "fach", "aktiv"]);
  });
});

describe("sammelVorschau", () => {
  it("nennt je Artikel die Felder, die sich dort wirklich ändern", () => {
    const vorschau = sammelVorschau(
      [
        zeile({ id: "a", fach: "A-01" }),
        zeile({ id: "b", fach: "B-02" }),
      ],
      { fach: "B-02" },
    );
    expect(vorschau.zeilen.map((z) => [z.id, z.felder])).toEqual([
      ["a", ["fach"]],
      ["b", []],
    ]);
    expect(vorschau.betroffen).toBe(1);
    expect(vorschau.unveraendert).toBe(1);
  });

  it("zählt einen Artikel einmal, auch wenn zwei Felder ihn treffen", () => {
    const vorschau = sammelVorschau(
      [zeile({ id: "a", fach: "A-01", kategorie: "Hygiene" })],
      { fach: "B-02", kategorie: "Verbandmaterial" },
    );
    expect(vorschau.zeilen[0]!.felder).toEqual(["kategorie", "fach"]);
    expect(vorschau.betroffen).toBe(1);
  });

  it("behält die übergebene Reihenfolge der Artikel", () => {
    const vorschau = sammelVorschau(
      [zeile({ id: "z", name: "Zulu" }), zeile({ id: "a", name: "Alpha" })],
      { aktiv: false },
    );
    expect(vorschau.zeilen.map((z) => z.id)).toEqual(["z", "a"]);
  });

  it("ohne gesetztes Feld ändert sich nichts", () => {
    const vorschau = sammelVorschau([zeile(), zeile({ id: "b" })], {});
    expect(vorschau.felder).toEqual([]);
    expect(vorschau.betroffen).toBe(0);
    expect(vorschau.unveraendert).toBe(2);
  });

  it("„ohne Kategorie“ trifft einen Artikel mit Kategorie und lässt einen ohne in Ruhe", () => {
    const vorschau = sammelVorschau(
      [zeile({ id: "mit", kategorie: "Hygiene" }), zeile({ id: "ohne", kategorie: null })],
      { kategorie: null },
    );
    expect(vorschau.zeilen.map((z) => [z.id, z.felder])).toEqual([
      ["mit", ["kategorie"]],
      ["ohne", []],
    ]);
  });

  it("vergleicht die Kategorie zeichengenau, nicht gefaltet", () => {
    // Wer „Verbandmaterial“ auf „verbandmaterial“ legt, hat sich für eine
    // Schreibweise entschieden — das ist eine Änderung und wird als eine gezeigt.
    const vorschau = sammelVorschau(
      [zeile({ kategorie: "verbandmaterial" })],
      { kategorie: "Verbandmaterial" },
    );
    expect(vorschau.betroffen).toBe(1);
  });

  it("der Statuswechsel trifft nur die andere Seite", () => {
    const vorschau = sammelVorschau(
      [zeile({ id: "a", aktiv: true }), zeile({ id: "i", aktiv: false })],
      { aktiv: false },
    );
    expect(vorschau.betroffen).toBe(1);
    expect(vorschau.zeilen[1]!.felder).toEqual([]);
  });

  it("leere Auswahl ergibt eine leere Vorschau", () => {
    const vorschau = sammelVorschau([], { fach: "B-02" });
    expect(vorschau.zeilen).toEqual([]);
    expect(vorschau.betroffen).toBe(0);
    expect(vorschau.unveraendert).toBe(0);
    expect(vorschau.felder).toEqual(["fach"]);
  });
});

describe("sammelWertText", () => {
  it("nennt den Zielwert so, wie er auf dem Bildschirm steht", () => {
    expect(sammelWertText("kategorie", { kategorie: "Hygiene" })).toBe("Hygiene");
    expect(sammelWertText("kategorie", { kategorie: null })).toBe("ohne Kategorie");
    expect(sammelWertText("fach", { fach: "B-02" })).toBe("B-02");
    expect(sammelWertText("aktiv", { aktiv: true })).toBe("aktiv");
    expect(sammelWertText("aktiv", { aktiv: false })).toBe("inaktiv");
  });
});

describe("fachNormalisieren", () => {
  it("trimmt und schreibt groß — wie das Stammdatenfeld der Schublade", () => {
    expect(fachNormalisieren("  b-02 ")).toBe("B-02");
  });
});

describe("sammelAenderungBauen", () => {
  it("lässt ein nicht angehaktes Feld ganz weg", () => {
    const aenderung = sammelAenderungBauen({
      kategorie: { an: false, wert: "Hygiene" },
      fach: { an: true, wert: " b-02 " },
    });
    expect(aenderung).toEqual({ fach: "B-02" });
    // Nicht `{ kategorie: undefined, fach: "B-02" }` — `Object.keys` zählte das mit.
    expect(Object.keys(aenderung)).toEqual(["fach"]);
  });

  it("macht aus einem leeren Kategoriefeld „ohne Kategorie“, nicht einen Leerstring", () => {
    expect(sammelAenderungBauen({ kategorie: { an: true, wert: "   " } }))
      .toEqual({ kategorie: null });
  });

  it("übernimmt den Status, auch wenn er `false` ist", () => {
    expect(sammelAenderungBauen({ aktiv: { an: true, wert: false } }))
      .toEqual({ aktiv: false });
  });
});

describe("idBloecke", () => {
  it("zerlegt nach Blockgröße", () => {
    expect(idBloecke(["a", "b", "c"], 2)).toEqual([["a", "b"], ["c"]]);
  });

  it("leere Eingabe ergibt keinen Block", () => {
    expect(idBloecke([], 2)).toEqual([]);
  });

  it("eine volle Blockgröße ergibt genau einen Block", () => {
    expect(idBloecke(["a", "b"], 2)).toEqual([["a", "b"]]);
  });
});
