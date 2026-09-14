import { describe, expect, it } from "vitest";
import { OHNE_WERT, trifftWert, werteAlsFilter, zustandsFilter } from "./spaltenfilter";

type Zeile = { kategorie: string | null; bestand: number; aktiv: boolean };

const ZEILEN: Zeile[] = [
  { kategorie: "Verbandmaterial", bestand: 0, aktiv: true },
  { kategorie: "Infusion", bestand: 5, aktiv: true },
  { kategorie: "Verbandmaterial", bestand: 12, aktiv: false },
  { kategorie: null, bestand: 3, aktiv: true },
  { kategorie: "", bestand: 7, aktiv: true },
];

describe("werteAlsFilter", () => {
  it("fasst doppelte Werte zusammen und sortiert deutsch", () => {
    const filter = werteAlsFilter(ZEILEN, (z) => z.kategorie);
    expect(filter.map((f) => f.value)).toEqual(["Infusion", "Verbandmaterial"]);
  });

  it("bietet den Fall ohne Wert nur an, wenn er benannt wird", () => {
    expect(werteAlsFilter(ZEILEN, (z) => z.kategorie)).toHaveLength(2);
    const mitLeer = werteAlsFilter(ZEILEN, (z) => z.kategorie, { ohneWertLabel: "ohne" });
    expect(mitLeer).toHaveLength(3);
    expect(mitLeer.at(-1)).toEqual({ text: "ohne", value: OHNE_WERT });
  });

  it("bietet den Fall ohne Wert NICHT an, wenn es keinen gibt", () => {
    const voll: Zeile[] = [{ kategorie: "A", bestand: 1, aktiv: true }];
    expect(werteAlsFilter(voll, (z) => z.kategorie, { ohneWertLabel: "ohne" })).toHaveLength(1);
  });

  it("nennt keine Option, die keine Zeile trifft", () => {
    // Die Liste entsteht aus den Daten — das ist die Zusage, die einen
    // Spaltenfilter von einer Pflegetabelle unterscheidet.
    const filter = werteAlsFilter(ZEILEN, (z) => z.kategorie);
    const treffer = trifftWert<Zeile>((z) => z.kategorie);
    for (const eintrag of filter) {
      expect(ZEILEN.some((z) => treffer(eintrag.value as string, z))).toBe(true);
    }
  });
});

describe("trifftWert", () => {
  const treffer = trifftWert<Zeile>((z) => z.kategorie);

  it("trifft den genauen Wert", () => {
    expect(ZEILEN.filter((z) => treffer("Verbandmaterial", z))).toHaveLength(2);
  });

  it("fasst null und Leerzeichenkette unter OHNE_WERT zusammen", () => {
    // Beides heisst fuer den Leser „ohne Kategorie"; zwei getrennte Optionen
    // waeren ein Unterschied, den die Oberflaeche nirgends zeigt.
    expect(ZEILEN.filter((z) => treffer(OHNE_WERT, z))).toHaveLength(2);
  });
});

describe("zustandsFilter", () => {
  const { filters, onFilter } = zustandsFilter<Zeile>([
    { wert: "leer", text: "Bestand 0", trifft: (z) => z.bestand === 0 },
    { wert: "inaktiv", text: "inaktiv", trifft: (z) => !z.aktiv },
  ]);

  it("nennt jeden Zustand als Option", () => {
    expect(filters.map((f) => f.value)).toEqual(["leer", "inaktiv"]);
  });

  it("beantwortet jeden Zustand einzeln", () => {
    expect(ZEILEN.filter((z) => onFilter("leer", z))).toHaveLength(1);
    expect(ZEILEN.filter((z) => onFilter("inaktiv", z))).toHaveLength(1);
  });

  it("trifft bei zwei angekreuzten Zustaenden die VEREINIGUNG", () => {
    // antd ruft `onFilter` je angekreuztem Wert auf und verodert das Ergebnis
    // (`useFilter/index.js:140`, `realKeys.some(...)`). Diese Erwartung haelt
    // fest, dass die Helfer dieselbe Bedeutung tragen wie die abgeloeste
    // Knopfleiste — dort war jeder Haken ebenfalls eine Erweiterung.
    const angekreuzt = ["leer", "inaktiv"];
    const sichtbar = ZEILEN.filter((z) => angekreuzt.some((w) => onFilter(w, z)));
    expect(sichtbar).toHaveLength(2);
  });

  it("trifft nichts bei einem unbekannten Wert", () => {
    expect(ZEILEN.filter((z) => onFilter("gibtsnicht", z))).toHaveLength(0);
  });
});
