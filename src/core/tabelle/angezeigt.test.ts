import { describe, expect, it } from "vitest";
import type { Key } from "react";
import {
  angezeigteAnzahl,
  angezeigteZeilen,
  filterAktiv,
  filterAusSpalten,
  spaltenSchluessel,
  wendeFilterAn,
  wendeSortierungAn,
  type AnzeigeSpalte,
} from "./angezeigt";
import { nachText, nachZahl } from "./sortierer";

type Zeile = { id: string; name: string; fach: string; bestand: number; aktiv: boolean };

const ZEILEN: Zeile[] = [
  { id: "1", name: "Mullbinde", fach: "A1", bestand: 12, aktiv: true },
  { id: "2", name: "Kompresse", fach: "B2", bestand: 0, aktiv: false },
  { id: "3", name: "Pflaster", fach: "A1", bestand: 3, aktiv: true },
];

const SPALTEN: AnzeigeSpalte<Zeile>[] = [
  { dataIndex: "name", sorter: nachText<Zeile>((z) => z.name) },
  {
    dataIndex: "fach",
    onFilter: (wert, zeile) => zeile.fach === wert,
    sorter: nachText<Zeile>((z) => z.fach),
  },
  { dataIndex: "bestand", sorter: nachZahl<Zeile>((z) => z.bestand) },
  {
    key: "status",
    onFilter: (wert, zeile) => (wert === "inaktiv" ? !zeile.aktiv : zeile.bestand === 0),
  },
];

describe("spaltenSchluessel", () => {
  it("nimmt `key`, sonst `dataIndex`", () => {
    expect(spaltenSchluessel({ key: "status", dataIndex: "aktiv" })).toBe("status");
    expect(spaltenSchluessel({ dataIndex: "name" })).toBe("name");
  });

  it("liefert null, wo antd gar keinen Schluessel meldet", () => {
    // Eine Spalte ohne beides kann nicht gefiltert werden — sie taucht in keinem
    // Filterzustand auf, und ein erfundener Schluessel traefe die falsche Spalte.
    expect(spaltenSchluessel({})).toBeNull();
    expect(spaltenSchluessel({ dataIndex: ["a", "b"] })).toBeNull();
    expect(spaltenSchluessel({ dataIndex: null })).toBeNull();
  });
});

describe("wendeFilterAn", () => {
  it("laesst ohne Filter alles durch", () => {
    expect(wendeFilterAn(ZEILEN, SPALTEN, {})).toHaveLength(3);
    expect(wendeFilterAn(ZEILEN, SPALTEN, { fach: [] })).toHaveLength(3);
    expect(wendeFilterAn(ZEILEN, SPALTEN, { fach: null })).toHaveLength(3);
  });

  it("filtert ueber den Spaltenschluessel", () => {
    expect(wendeFilterAn(ZEILEN, SPALTEN, { fach: ["A1"] }).map((z) => z.id))
      .toEqual(["1", "3"]);
  });

  /**
   * ⚠️ DIE VERKNUEPFUNG IST NICHT FREI WAEHLBAR — sie muss antds eigene sein,
   * sonst zeigt diese Rechnung eine andere Liste als die Tabelle daneben.
   * `useFilter/index.js` ruft `realKeys.some(...)` je Spalte und geht die
   * Spalten nacheinander durch: innerhalb einer Spalte ODER, zwischen Spalten
   * UND.
   */
  it("verknuepft INNERHALB einer Spalte mit ODER", () => {
    expect(wendeFilterAn(ZEILEN, SPALTEN, { fach: ["A1", "B2"] })).toHaveLength(3);
  });

  it("verknuepft ZWISCHEN Spalten mit UND", () => {
    // Fach A1 (Zeilen 1 und 3) UND Status inaktiv (Zeile 2) ist leer.
    expect(wendeFilterAn(ZEILEN, SPALTEN, { fach: ["A1"], status: ["inaktiv"] }))
      .toHaveLength(0);
    // Fach B2 (Zeile 2) UND inaktiv (Zeile 2) trifft genau eine.
    expect(wendeFilterAn(ZEILEN, SPALTEN, { fach: ["B2"], status: ["inaktiv"] }).map((z) => z.id))
      .toEqual(["2"]);
  });

  it("ueberspringt eine Spalte ohne `onFilter`", () => {
    // `name` traegt keinen Filter — ein Zustand dazu darf nichts wegnehmen.
    expect(wendeFilterAn(ZEILEN, SPALTEN, { name: ["Mullbinde"] })).toHaveLength(3);
  });

  it("veraendert die Eingabeliste nicht", () => {
    const vorher = [...ZEILEN];
    wendeFilterAn(ZEILEN, SPALTEN, { fach: ["A1"] });
    expect(ZEILEN).toEqual(vorher);
  });
});

describe("wendeSortierungAn", () => {
  it("laesst ohne Sortierung die Reihenfolge stehen", () => {
    expect(wendeSortierungAn(ZEILEN, SPALTEN, {}).map((z) => z.id)).toEqual(["1", "2", "3"]);
    expect(wendeSortierungAn(ZEILEN, SPALTEN, { spalte: "name" }).map((z) => z.id))
      .toEqual(["1", "2", "3"]);
  });

  it("sortiert auf- und absteigend", () => {
    expect(
      wendeSortierungAn(ZEILEN, SPALTEN, { spalte: "bestand", richtung: "ascend" })
        .map((z) => z.bestand),
    ).toEqual([0, 3, 12]);
    expect(
      wendeSortierungAn(ZEILEN, SPALTEN, { spalte: "bestand", richtung: "descend" })
        .map((z) => z.bestand),
    ).toEqual([12, 3, 0]);
  });

  it("ignoriert eine Spalte ohne brauchbaren `sorter`", () => {
    // `sorter: true` heisst bei antd ausdruecklich „serverseitig sortiert" —
    // hier waere jede eigene Ordnung eine Erfindung.
    const serverSpalten: AnzeigeSpalte<Zeile>[] = [{ dataIndex: "name", sorter: true }];
    expect(
      wendeSortierungAn(ZEILEN, serverSpalten, { spalte: "name", richtung: "ascend" })
        .map((z) => z.id),
    ).toEqual(["1", "2", "3"]);
  });

  it("liest auch die Objektform `{ compare }`", () => {
    const spalten: AnzeigeSpalte<Zeile>[] = [
      { dataIndex: "name", sorter: { compare: nachText<Zeile>((z) => z.name) } },
    ];
    expect(
      wendeSortierungAn(ZEILEN, spalten, { spalte: "name", richtung: "ascend" })
        .map((z) => z.name),
    ).toEqual(["Kompresse", "Mullbinde", "Pflaster"]);
  });

  it("veraendert die Eingabeliste nicht", () => {
    const vorher = [...ZEILEN];
    wendeSortierungAn(ZEILEN, SPALTEN, { spalte: "bestand", richtung: "descend" });
    expect(ZEILEN).toEqual(vorher);
  });
});

describe("angezeigteZeilen", () => {
  /**
   * ⚠️ DIE REIHENFOLGE IST NICHT BELIEBIG: erst filtern, dann sortieren — so
   * macht es antd auch. Andersherum waere das Ergebnis zwar dieselbe MENGE, aber
   * die Sortierung liefe ueber Zeilen, die gar nicht gezeigt werden, und ein
   * instabiler Vergleicher koennte eine andere Ordnung liefern.
   */
  it("filtert und sortiert in antds Reihenfolge", () => {
    expect(
      angezeigteZeilen(ZEILEN, SPALTEN, { fach: ["A1"] }, { spalte: "bestand", richtung: "ascend" })
        .map((z) => z.id),
    ).toEqual(["3", "1"]);
  });

  /**
   * ⚠️ DER EIGENTLICHE GRUND FUER DIESES MODUL. Die angezeigte Menge ist eine
   * FUNKTION des Zustands, kein gemerkter Stand — deshalb ist sie nach einer
   * Aenderung der Datenquelle sofort richtig, ohne dass `onChange` gefeuert
   * haette. Genau das schlug fehl, als die Liste aus `extra.currentDataSource`
   * gemerkt wurde: Filter setzen, dann suchen → die gemerkte Liste blieb auf dem
   * Stand von vor der Suche.
   */
  it("folgt einer geaenderten Datenquelle sofort", () => {
    const zustand = { fach: ["A1"] };
    const sortierung = { spalte: "name", richtung: "ascend" as const };
    expect(angezeigteZeilen(ZEILEN, SPALTEN, zustand, sortierung).map((z) => z.id))
      .toEqual(["1", "3"]);

    // Dieselben Filter, kleinere Quelle — ohne jeden weiteren Aufruf.
    const weniger = ZEILEN.filter((z) => z.name.startsWith("P"));
    expect(angezeigteZeilen(weniger, SPALTEN, zustand, sortierung).map((z) => z.id))
      .toEqual(["3"]);
  });
});

/**
 * ⚠️ WORUEBER DIESE FRAGE ENTSCHEIDET: den LEERTEXT einer Tabelle. „Noch keine
 * Artikel. Lege oben den ersten an." ist falsch, sobald bloss Spaltenfilter
 * ohne Schnittmenge gesetzt sind — es gibt Artikel, sie passen nur nicht.
 */
describe("filterAktiv", () => {
  it("ist ohne jeden Filter falsch", () => {
    expect(filterAktiv({})).toBe(false);
  });

  it("wertet eine geleerte Spalte wie eine nie beruehrte", () => {
    // antd meldet eine zurueckgesetzte Spalte als `null`, eine nie geoeffnete
    // gar nicht — beides heisst „kein Filter", und `[]` ebenso.
    expect(filterAktiv({ fach: null })).toBe(false);
    expect(filterAktiv({ fach: [] })).toBe(false);
    expect(filterAktiv({ fach: null, aktiv: [] })).toBe(false);
  });

  it("genuegt EIN gesetzter Wert in EINER Spalte", () => {
    expect(filterAktiv({ fach: ["A1"] })).toBe(true);
    expect(filterAktiv({ fach: null, aktiv: [false] })).toBe(true);
  });

  it("zaehlt auch `false` als gesetzten Wert", () => {
    // `false` ist ein gueltiger Filterwert (antds `React.Key | boolean`); eine
    // Pruefung ueber die Wahrheit der Werte statt ueber ihre ANZAHL laege hier
    // falsch und liesse „nur inaktive" als ungefiltert durchgehen.
    expect(filterAktiv({ aktiv: [false] })).toBe(true);
  });
});

/**
 * ⚠️ DIESE ZAHL WIRD NICHT GELESEN, SIE WIRD GERECHNET — und damit ist sie die
 * Stelle, an der sie falsch sein kann, ohne dass ein Tor es meldet. `aria-rowcount`
 * hängt daran: eine zu große Zahl lässt eine Vorleseanwendung „Zeile 3 von 800"
 * an einer Tabelle mit zwanzig Zeilen ansagen.
 */
describe("filterAusSpalten", () => {
  const spalte = (key: string, extra: Record<string, unknown> = {}) => ({
    key,
    onFilter: (wert: Key | boolean, zeile: { a?: unknown; b?: unknown }) =>
      zeile[key as "a" | "b"] === wert,
    ...extra,
  });

  it("uebergeht eine Spalte ohne `filters` — sie filtert gar nicht", () => {
    expect(filterAusSpalten([spalte("a")])).toEqual({ zustand: {}, unbekannt: false });
  });

  it("liest den gesteuerten Stand aus `filteredValue`", () => {
    const ergebnis = filterAusSpalten([
      spalte("a", { filters: [{ text: "x", value: 1 }], filteredValue: [1] }),
      spalte("b", { filters: [{ text: "y", value: 2 }], filteredValue: null }),
    ]);
    expect(ergebnis).toEqual({ zustand: { a: [1], b: null }, unbekannt: false });
  });

  it("meldet `unbekannt`, wenn eine Spalte UNGESTEUERT filtert", () => {
    // `filters` ohne `filteredValue`: antd fuehrt den Stand intern, von auszen
    // ist er nicht zu sehen. Ihn als „kein Filter" zu lesen ergaebe eine zu
    // grosze Zahl — still, und genau dann, wenn jemand filtert.
    const ergebnis = filterAusSpalten([spalte("a", { filters: [{ text: "x", value: 1 }] })]);
    expect(ergebnis.unbekannt).toBe(true);
    expect(ergebnis.zustand).toEqual({});
  });
});

describe("angezeigteAnzahl", () => {
  type Z = { a: number };
  const zeilen: Z[] = [{ a: 1 }, { a: 1 }, { a: 2 }, { a: 3 }];
  const spalte = (extra: Record<string, unknown>) => ({
    key: "a",
    onFilter: (wert: Key | boolean, zeile: Z) => zeile.a === wert,
    ...extra,
  });

  it("ist die ganze Liste, solange kein Filter greift", () => {
    expect(angezeigteAnzahl(zeilen, [spalte({ filters: [], filteredValue: null })])).toBe(4);
    expect(angezeigteAnzahl(zeilen, undefined)).toBe(4);
  });

  it("zaehlt NACH dem Spaltenfilter", () => {
    expect(angezeigteAnzahl(zeilen, [spalte({ filters: [], filteredValue: [1] })])).toBe(2);
  });

  it("zaehlt mehrere Werte EINER Spalte als Vereinigung", () => {
    // Dieselbe Bedeutung wie antds `realKeys.some(...)` — wer hier schneidet
    // statt zu vereinigen, zeigt eine andere Zahl als die Tabelle daneben.
    expect(angezeigteAnzahl(zeilen, [spalte({ filters: [], filteredValue: [1, 3] })])).toBe(3);
  });

  it("kann 0 sein, und das ist eine Zahl — kein „unbekannt\"", () => {
    expect(angezeigteAnzahl(zeilen, [spalte({ filters: [], filteredValue: [99] })])).toBe(0);
  });

  it("liefert null, sobald eine Spalte ungesteuert filtert", () => {
    expect(angezeigteAnzahl(zeilen, [spalte({ filters: [{ text: "x", value: 1 }] })])).toBeNull();
  });

  it("liefert 0 ohne Datenquelle", () => {
    expect(angezeigteAnzahl(undefined, undefined)).toBe(0);
  });
});
