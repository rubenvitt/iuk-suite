/**
 * Was `kartenaufbau.ts` entscheidet — geprüft, ohne etwas zu rendern.
 *
 * ⚠️ DIESE DATEI BESITZT DIE AUFTEILUNG, NICHT IHR AUSSEHEN. Ob eine Karte auf
 * 390px gut aussieht, kann nur ein echter Browser sagen (`e2e/`); dass die
 * richtige Spalte zur Überschrift wird und keine still herausfällt, ist eine
 * Frage an eine reine Funktion. Dieselbe Aufteilung wie `masse.ts` gegenüber
 * `Datentabelle.tsx`.
 */

import { describe, expect, it } from "vitest";
import { anfangsSortierung } from "./angezeigt";
import {
  kartenaufbau,
  schluesselAus,
  traegtInhalt,
  zellenInhalt,
  type KartenSpalte,
} from "./kartenaufbau";

type Zeile = { id: string; name: string; fach: string | null; tief?: { wert: number } };

const ZEILE: Zeile = { id: "a1", name: "Mullbinde", fach: "3", tief: { wert: 7 } };

const SPALTEN: KartenSpalte<Zeile>[] = [
  { title: "Artikel", dataIndex: "name" },
  { title: "Fach", dataIndex: "fach" },
  { title: "Aktionen", key: "aktionen", render: () => "knopf" },
];

describe("kartenaufbau", () => {
  it("macht die erste Spalte zur Überschrift und den Rest zu Merkmalen", () => {
    const aufbau = kartenaufbau(SPALTEN);
    expect(aufbau.titel?.schluessel).toBe("name");
    expect(aufbau.merkmale.map((f) => f.schluessel)).toEqual(["fach"]);
  });

  it("erkennt die Handlungsspalte an ihrem Titel", () => {
    expect(kartenaufbau(SPALTEN).aktionen?.schluessel).toBe("aktionen");
    expect(kartenaufbau([{ title: "Aktion", key: "a" }]).aktionen?.schluessel).toBe("a");
  });

  /*
   * ⚠️ DIE REIHENFOLGE IST DER PUNKT: wird der Titel vor der Handlungsspalte
   * bestimmt, bekommt eine Tabelle, deren erste Spalte „Aktionen" heißt, einen
   * Knopf als Überschrift.
   */
  it("macht eine Handlungsspalte nicht zur Überschrift, auch wenn sie vorn steht", () => {
    const aufbau = kartenaufbau<Zeile>([
      { title: "Aktionen", key: "aktionen" },
      { title: "Artikel", dataIndex: "name" },
    ]);
    expect(aufbau.titel?.schluessel).toBe("name");
    expect(aufbau.aktionen?.schluessel).toBe("aktionen");
  });

  it("nimmt Ausgeblendetes weder als Titel noch als Merkmal", () => {
    const aufbau = kartenaufbau(SPALTEN, { aus: ["name"] });
    expect(aufbau.titel?.schluessel).toBe("fach");
    expect(aufbau.merkmale).toHaveLength(0);
  });

  it("stellt Kennzeichen neben den Titel statt in die Merkmalsliste", () => {
    const aufbau = kartenaufbau(SPALTEN, { kennzeichen: ["fach"] });
    expect(aufbau.kennzeichen.map((f) => f.schluessel)).toEqual(["fach"]);
    expect(aufbau.merkmale).toHaveLength(0);
  });

  /*
   * Ein gruppierter Spaltenkopf trägt selbst keinen Wert. Wer nur die oberste
   * Ebene liest, baut eine Karte aus Gruppennamen ohne eine einzige Zahl.
   */
  it("steigt in gruppierte Spaltenköpfe ab", () => {
    const aufbau = kartenaufbau<Zeile>([
      { title: "Artikel", dataIndex: "name" },
      { title: "Lager", children: [{ title: "Fach", dataIndex: "fach" }] },
    ]);
    expect(aufbau.merkmale.map((f) => f.beschriftung)).toEqual(["Fach"]);
  });

  /*
   * ⚠️ EINE SPALTE, DIE NUR RENDERT, HAT WEDER `key` NOCH `dataIndex` — und
   * davon hat fast jede Tabelle dieser Suite eine. Ohne Positionsrückfall fiele
   * sie still aus der Karte.
   */
  it("gibt einer Spalte ohne Schlüssel eine Position als Adresse", () => {
    const aufbau = kartenaufbau<Zeile>([
      { title: "Artikel", dataIndex: "name" },
      { title: "Abgeleitet", render: () => "x" },
    ]);
    expect(aufbau.merkmale.map((f) => f.schluessel)).toEqual(["#1"]);
  });

  it("meldet einen Schlüssel, den es nicht gibt", () => {
    expect(kartenaufbau(SPALTEN, { titel: "gibtsnicht" }).hinweis)
      .toContain("gibtsnicht");
    expect(kartenaufbau(SPALTEN).hinweis).toBeUndefined();
  });

  it("kommt ohne Spalten aus", () => {
    const aufbau = kartenaufbau<Zeile>(undefined);
    expect(aufbau.titel).toBeNull();
    expect(aufbau.merkmale).toHaveLength(0);
  });
});

describe("zellenInhalt", () => {
  it("liest den Wert über `dataIndex`, auch als Pfad", () => {
    expect(zellenInhalt({ dataIndex: "name" }, ZEILE, 0)).toBe("Mullbinde");
    expect(zellenInhalt({ dataIndex: ["tief", "wert"] }, ZEILE, 0)).toBe(7);
  });

  it("reicht `render` den Rohwert, die Zeile und die Position", () => {
    const spalte: KartenSpalte<Zeile> = {
      dataIndex: "name",
      render: (wert, zeile, index) => `${String(wert)}/${zeile.id}/${index}`,
    };
    expect(zellenInhalt(spalte, ZEILE, 4)).toBe("Mullbinde/a1/4");
  });

  /*
   * ⚠️ antds `RenderedCell` ist `{ children, props }` — unverändert an React
   * gereicht stünde „Objects are not valid as a React child" auf der Seite.
   * Auf einer Karte gibt es keine Zellen zusammenzufassen, also zählt
   * `children`.
   */
  it("packt eine RenderedCell aus, statt sie an React zu reichen", () => {
    const spalte: KartenSpalte<Zeile> = {
      render: () => ({ children: "Wert", props: { colSpan: 2 } }),
    };
    expect(zellenInhalt(spalte, ZEILE, 0)).toBe("Wert");
  });

  it("lässt ein echtes React-Element unangetastet", () => {
    const element = { $$typeof: Symbol.for("react.transitional.element"), type: "span", props: {}, key: null };
    const spalte: KartenSpalte<Zeile> = { render: () => element };
    expect(zellenInhalt(spalte, ZEILE, 0)).toBe(element);
  });

  it("gibt für ein fehlendes Feld nichts zurück, statt zu werfen", () => {
    expect(zellenInhalt({ dataIndex: ["tief", "gibtsnicht"] }, ZEILE, 0)).toBeUndefined();
    expect(zellenInhalt({ dataIndex: ["fach", "tiefer"] }, { ...ZEILE, fach: null }, 0))
      .toBeUndefined();
  });
});

describe("traegtInhalt", () => {
  it("lässt Leeres weg", () => {
    expect(traegtInhalt(null)).toBe(false);
    expect(traegtInhalt(undefined)).toBe(false);
    expect(traegtInhalt("")).toBe(false);
    expect(traegtInhalt("   ")).toBe(false);
    expect(traegtInhalt([null, ""])).toBe(false);
  });

  /*
   * ⚠️ „—" IST EIN WERT. Ein Gedankenstrich ist die Aussage des Aufrufers
   * „hier steht nichts"; ihn wegzufiltern verwischt den Unterschied zwischen
   * „nicht eingetragen" und „gibt es für diese Zeile nicht".
   */
  it("behält den Gedankenstrich und die Null", () => {
    expect(traegtInhalt("—")).toBe(true);
    expect(traegtInhalt(0)).toBe(true);
  });
});

describe("schluesselAus", () => {
  it("nimmt ein Feld oder eine Funktion", () => {
    expect(schluesselAus<Zeile>("id")(ZEILE, 0)).toBe("a1");
    expect(schluesselAus<Zeile>((zeile) => `x-${zeile.id}`)(ZEILE, 0)).toBe("x-a1");
  });

  it("fällt auf `key` zurück, wie antd selbst", () => {
    expect(schluesselAus<{ key: string }>(undefined)({ key: "k" }, 0)).toBe("k");
  });
});

describe("die titellose letzte Spalte", () => {
  /*
   * ⚠️ EIN KNAPPES DUTZEND TABELLEN DIESER SUITE SCHREIBT SEINE KNOPFZEILE IN
   * EINE SPALTE MIT `title: ""`. Ohne diese Regel stünde sie als Merkmal in der
   * Beschreibungsliste, mit einer leeren Beschriftung daneben — gemessen an
   * `files/ZugangslinksListe`.
   */
  it("gilt als Handlungsspalte", () => {
    const aufbau = kartenaufbau<Zeile>([
      { title: "Artikel", dataIndex: "name" },
      { title: "Fach", dataIndex: "fach" },
      { title: "", key: "knoepfe", render: () => "Widerrufen" },
    ]);
    expect(aufbau.aktionen?.schluessel).toBe("knoepfe");
    expect(aufbau.merkmale.map((f) => f.schluessel)).toEqual(["fach"]);
  });

  /*
   * ⚠️ NUR DIE LETZTE. Eine titellose Spalte MITTEN in der Liste ist keine
   * Knopfzeile, sondern die Fortsetzung ihrer Nachbarin; sie ans Ende der Karte
   * zu ziehen risse sie von ihrem Bezug los.
   */
  it("gilt nicht, wenn die titellose Spalte in der Mitte steht", () => {
    const aufbau = kartenaufbau<Zeile>([
      { title: "Artikel", dataIndex: "name" },
      { title: "", key: "symbol" },
      { title: "Fach", dataIndex: "fach" },
    ]);
    expect(aufbau.aktionen).toBeNull();
    expect(aufbau.merkmale.map((f) => f.schluessel)).toEqual(["symbol", "fach"]);
  });

  /* Eine Tabelle mit nur einer Spalte hätte sonst keinen Titel mehr. */
  it("gilt nicht, wenn sie die einzige Spalte ist", () => {
    const aufbau = kartenaufbau<Zeile>([{ title: "", key: "nur" }]);
    expect(aufbau.aktionen).toBeNull();
    expect(aufbau.titel?.schluessel).toBe("nur");
  });
});

describe("eine Spalte ohne `dataIndex`", () => {
  /*
   * ⚠️ WÖRTLICH rc-tableS EIGENE RECHNUNG (`Cell/useCellRender.js`): ohne
   * `dataIndex` ist der Pfad leer, und ein leerer Pfad gibt das Objekt SELBST
   * zurück. Eine Spalte mit nur `key` und `render` bekommt den Datensatz also
   * als ERSTEN Parameter. Gab man dort `undefined` herein, riss die Karte mit
   * „Cannot read properties of undefined" — gemessen an
   * `lagerorte/LagerorteListe.tsx`, das `render: (zeile) => …` schreibt.
   */
  it("bekommt die ganze Zeile als ersten Renderwert", () => {
    const spalte: KartenSpalte<Zeile> = { key: "k", render: (wert) => (wert as Zeile).name };
    expect(zellenInhalt(spalte, ZEILE, 0)).toBe("Mullbinde");
  });

  it("zeigt ohne `render` nichts, statt das Objekt an React zu reichen", () => {
    // „Objects are not valid as a React child" wäre die Alternative.
    expect(zellenInhalt({ key: "k" }, ZEILE, 0)).toBeNull();
  });
});

describe("anfangsSortierung", () => {
  /*
   * ⚠️ WER DIE SORTIERUNG STEUERT, MUSS SIE AUCH STARTEN. Sobald eine Spalte
   * ein `sortOrder` bekommt, ignoriert antd ihr `defaultSortOrder` — ohne
   * diesen Startwert stünde jede Tabelle mit Anfangssortierung still
   * unsortiert da. Sieben Tabellen dieser Suite sind betroffen.
   */
  it("liest den Startwert aus `defaultSortOrder`", () => {
    expect(anfangsSortierung<Zeile>([
      { title: "Artikel", dataIndex: "name" },
      { title: "Fach", dataIndex: "fach", defaultSortOrder: "descend" },
    ])).toEqual({ spalte: "fach", richtung: "descend" });
  });

  it("bleibt leer, wenn keine Spalte einen Startwert nennt", () => {
    expect(anfangsSortierung<Zeile>([{ title: "Artikel", dataIndex: "name" }])).toEqual({});
  });

  it("steigt auch dafür in gruppierte Spaltenköpfe ab", () => {
    expect(anfangsSortierung<Zeile>([
      { title: "Lager", children: [{ title: "Fach", dataIndex: "fach", defaultSortOrder: "ascend" }] },
    ])).toEqual({ spalte: "fach", richtung: "ascend" });
  });
});
