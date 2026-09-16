import { describe, it, expect } from "vitest";
import { blatt, blattname, freiesBlatt, mappe, type ExportSpalte } from "./spalten";

/**
 * Der reine Teil des Excel-Bausteins — geprüft OHNE `write-excel-file`, ohne
 * DOM und ohne Route. Genau dafür ist er von den beiden Einstiegspunkten
 * getrennt (DRK-186).
 */

type Zeile = { name: string; menge: number; hinweis: string | null };

const SPALTEN: readonly ExportSpalte<Zeile>[] = [
  { kopf: "Artikel", breite: 30, wert: (z) => z.name },
  { kopf: "Menge", breite: 10, wert: (z) => z.menge },
  { kopf: "Hinweis", wert: (z) => z.hinweis },
];

describe("blatt", () => {
  it("setzt die Köpfe fett in Zeile 1 und die Daten darunter", () => {
    const b = blatt("Bestand", SPALTEN, [{ name: "Mullbinde", menge: 12, hinweis: null }]);
    expect(b.daten[0]).toEqual([
      { value: "Artikel", type: String, fontWeight: "bold" },
      { value: "Menge", type: String, fontWeight: "bold" },
      { value: "Hinweis", type: String, fontWeight: "bold" },
    ]);
    expect(b.daten[1]).toEqual([
      { value: "Mullbinde", type: String },
      { value: 12, type: Number },
      null,
    ]);
  });

  it("gibt Breiten nur weiter, wo eine gesetzt ist", () => {
    const b = blatt("Bestand", SPALTEN, []);
    expect(b.breiten).toEqual([{ width: 30 }, { width: 10 }, {}]);
  });

  /**
   * DER KERN DER VEREINHEITLICHUNG (DRK-186): eine Textzelle kann keine Formel
   * sein. Der CSV-Weg musste ein führendes `=`/`+`/`-`/`@` mit einem Apostroph
   * neutralisieren — vier Module bauten die Regel je einzeln nach. Auf diesem
   * Weg bleibt der Wert UNVERÄNDERT und trägt trotzdem keine Formel, weil
   * `type: String` die Zelle als Text anlegt.
   */
  it("trägt einen Formelbeginn unverändert und ohne Apostroph als Textzelle", () => {
    const b = blatt("X", [{ kopf: "K", wert: (z: { v: string }) => z.v }], [
      { v: "=1+1" }, { v: "+49 170" }, { v: "-Zugang" }, { v: "@Lager" },
    ]);
    expect(b.daten.slice(1).map((z) => z[0])).toEqual([
      { value: "=1+1", type: String },
      { value: "+49 170", type: String },
      { value: "-Zugang", type: String },
      { value: "@Lager", type: String },
    ]);
  });

  /** Eine negative Zahl bleibt eine Zahl — der Fall, an dem `lagerbuch`s
   *  CSV-Neutralisierung ausdrücklich vorbeigehen musste (`csvZelle.ts`), weil
   *  `'-3` in jeder Kalkulation als Text ankommt und die Spalte unsummierbar
   *  macht. Hier stellt sich die Frage nicht mehr. */
  it("hält eine negative Zahl als Zahl", () => {
    const b = blatt("X", [{ kopf: "K", wert: (z: { v: number }) => z.v }], [{ v: -3 }]);
    expect(b.daten[1][0]).toEqual({ value: -3, type: Number });
  });

  it("macht aus Leerstring und null dieselbe leere Zelle", () => {
    const b = blatt("X", [{ kopf: "K", wert: (z: { v: string | null }) => z.v }], [
      { v: "" }, { v: null },
    ]);
    expect(b.daten[1][0]).toEqual(null);
    expect(b.daten[2][0]).toEqual(null);
  });

  /** NaN entsteht aus jeder Division durch eine fehlende Zahl. Als Zahlenzelle
   *  wäre er in der Mappe kaputt; leer ist ehrlicher. */
  it("lässt eine Zelle leer, statt NaN oder Infinity zu schreiben", () => {
    const b = blatt("X", [{ kopf: "K", wert: (z: { v: number }) => z.v }], [
      { v: Number.NaN }, { v: Number.POSITIVE_INFINITY },
    ]);
    expect(b.daten[1][0]).toEqual(null);
    expect(b.daten[2][0]).toEqual(null);
  });

  it("gibt auch ohne Zeilen die Kopfzeile aus", () => {
    expect(blatt("X", SPALTEN, []).daten).toHaveLength(1);
  });
});

describe("blattname", () => {
  /** Excel öffnet eine Mappe mit einem solchen Blattnamen gar nicht — und der
   *  Fehler wäre still: die Datei entsteht, die Kalkulation lehnt sie ab. */
  it("räumt die in Excel verbotenen Zeichen weg", () => {
    expect(blattname("Abende: 2026/27 [alt]?*")).toBe("Abende  2026 27  alt");
  });

  it("kappt bei 31 Zeichen", () => {
    expect(blattname("A".repeat(40))).toHaveLength(31);
  });

  it("fällt auf einen Namen zurück, statt einen leeren zu liefern", () => {
    expect(blattname("///")).toBe("Blatt1");
  });
});

describe("freiesBlatt", () => {
  it("schreibt Zeilen ohne Kopfzeile und ohne Fettung", () => {
    const b = freiesBlatt("Kopfdaten", [["Gruppe", "Bereitschaft"], ["Abende", 12]], [20, 30]);
    expect(b.daten).toEqual([
      [{ value: "Gruppe", type: String }, { value: "Bereitschaft", type: String }],
      [{ value: "Abende", type: String }, { value: 12, type: Number }],
    ]);
    expect(b.breiten).toEqual([{ width: 20 }, { width: 30 }]);
  });
});

describe("mappe", () => {
  it("friert die Kopfzeile ein — aber nur auf Blättern, die eine haben", () => {
    const m = mappe([
      blatt("Daten", SPALTEN, [{ name: "a", menge: 1, hinweis: null }]),
      freiesBlatt("Kopfdaten", [["Gruppe", "B"]]),
    ]);
    expect(m[0].sheet).toBe("Daten");
    expect(m[0].stickyRowsCount).toBe(1);
    expect(m[1].sheet).toBe("Kopfdaten");
    expect(m[1].stickyRowsCount).toBeUndefined();
  });

  it("weist eine Mappe ohne Blatt ab", () => {
    expect(() => mappe([])).toThrow(/ohne Blatt/);
  });
});
