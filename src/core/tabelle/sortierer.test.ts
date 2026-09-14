import { describe, expect, it } from "vitest";
import { nachDatum, nachJaNein, nachRang, nachText, nachZahl } from "./sortierer";

type Zeile = {
  name: string | null;
  menge: number | null;
  verfall: string | null;
  aktiv: boolean;
  ampel: "rot" | "gelb" | "gruen" | null;
};

function z(teil: Partial<Zeile>): Zeile {
  return { name: null, menge: null, verfall: null, aktiv: false, ampel: null, ...teil };
}

/** Sortiert eine Liste und gibt ein ablesbares Feld zurueck. */
function sortiert<W>(
  zeilen: Zeile[],
  vergleich: (a: Zeile, b: Zeile) => number,
  lies: (zeile: Zeile) => W,
): W[] {
  return [...zeilen].sort(vergleich).map(lies);
}

describe("nachText", () => {
  const vergleich = nachText<Zeile>((zeile) => zeile.name);

  it("sortiert deutsch, nicht nach Zeichencode", () => {
    const zeilen = [z({ name: "Zange" }), z({ name: "Ärmel" }), z({ name: "Binde" })];
    // Nach Zeichencode stuende "Ärmel" (U+00C4) HINTER "Zange" (U+005A).
    expect(sortiert(zeilen, vergleich, (x) => x.name)).toEqual(["Ärmel", "Binde", "Zange"]);
  });

  it("sortiert Ziffernfolgen numerisch, nicht lexikalisch", () => {
    const zeilen = [z({ name: "Fach 10" }), z({ name: "Fach 2" }), z({ name: "Fach 1" })];
    // Lexikalisch stuende "Fach 10" vor "Fach 2" — in einem Lager mit
    // durchnummerierten Faechern ist das schlicht falsch.
    expect(sortiert(zeilen, vergleich, (x) => x.name)).toEqual(["Fach 1", "Fach 2", "Fach 10"]);
  });

  it("stellt leere Werte aufsteigend ans Ende", () => {
    const zeilen = [z({ name: null }), z({ name: "Binde" }), z({ name: "" })];
    expect(sortiert(zeilen, vergleich, (x) => x.name)).toEqual(["Binde", null, ""]);
  });

  it("ist symmetrisch — a<b heisst b>a", () => {
    const a = z({ name: "Alpha" });
    const b = z({ name: "Beta" });
    expect(Math.sign(vergleich(a, b))).toBe(-Math.sign(vergleich(b, a)));
  });
});

describe("nachZahl", () => {
  const vergleich = nachZahl<Zeile>((zeile) => zeile.menge);

  it("sortiert aufsteigend", () => {
    const zeilen = [z({ menge: 10 }), z({ menge: 2 }), z({ menge: -5 })];
    expect(sortiert(zeilen, vergleich, (x) => x.menge)).toEqual([-5, 2, 10]);
  });

  it("behandelt 0 als Wert, nicht als fehlend", () => {
    // Der naheliegende Fehler waere `!wert` — dann rutschte die 0 ans Ende, und
    // „Bestand 0" waere in einer nach Bestand sortierten Liste unauffindbar.
    const zeilen = [z({ menge: 5 }), z({ menge: null }), z({ menge: 0 })];
    expect(sortiert(zeilen, vergleich, (x) => x.menge)).toEqual([0, 5, null]);
  });

  it("stellt NaN wie fehlend ans Ende", () => {
    const zeilen = [z({ menge: Number.NaN }), z({ menge: 3 })];
    expect(sortiert(zeilen, vergleich, (x) => x.menge)[0]).toBe(3);
  });
});

describe("nachDatum", () => {
  const vergleich = nachDatum<Zeile>((zeile) => zeile.verfall);

  it("sortiert ISO-Zeichenketten aufsteigend", () => {
    const zeilen = [z({ verfall: "2026-12-01" }), z({ verfall: "2026-02-09" })];
    expect(sortiert(zeilen, vergleich, (x) => x.verfall)).toEqual(["2026-02-09", "2026-12-01"]);
  });

  it("stellt fehlende Daten ans Ende", () => {
    const zeilen = [z({ verfall: null }), z({ verfall: "2026-02-09" })];
    expect(sortiert(zeilen, vergleich, (x) => x.verfall)).toEqual(["2026-02-09", null]);
  });

  it("vergleicht auch echte Date-Objekte", () => {
    const frueh = new Date("2026-01-01T00:00:00Z");
    const spaet = new Date("2026-06-01T00:00:00Z");
    const v = nachDatum<{ t: Date }>((x) => x.t);
    expect(v({ t: frueh }, { t: spaet })).toBeLessThan(0);
  });
});

describe("nachJaNein", () => {
  it("stellt true nach vorn — der Fall, der Aufmerksamkeit verlangt", () => {
    const vergleich = nachJaNein<Zeile>((zeile) => zeile.aktiv);
    const zeilen = [z({ aktiv: false }), z({ aktiv: true }), z({ aktiv: false })];
    expect(sortiert(zeilen, vergleich, (x) => x.aktiv)).toEqual([true, false, false]);
  });
});

describe("nachRang", () => {
  const vergleich = nachRang<Zeile, "rot" | "gelb" | "gruen">(
    (zeile) => zeile.ampel,
    ["rot", "gelb", "gruen"],
  );

  it("folgt der fachlichen Ordnung, nicht dem Alphabet", () => {
    const zeilen = [z({ ampel: "gruen" }), z({ ampel: "rot" }), z({ ampel: "gelb" })];
    expect(sortiert(zeilen, vergleich, (x) => x.ampel)).toEqual(["rot", "gelb", "gruen"]);
  });

  it("stellt unbekannte und fehlende Werte ans Ende", () => {
    const zeilen = [z({ ampel: null }), z({ ampel: "gelb" })];
    expect(sortiert(zeilen, vergleich, (x) => x.ampel)).toEqual(["gelb", null]);
  });
});
