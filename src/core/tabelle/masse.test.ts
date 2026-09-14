import { describe, expect, it } from "vitest";
import { breitenSumme, scrollMasse, BREITE_NACH_INHALT, VIRTUELL_AB_ZEILEN } from "./masse";

/**
 * Dieser Test besitzt die Aussage, die KEIN anderes Tor treffen kann.
 *
 * Die Falle dahinter: `@rc-component/table` prüft `scroll.x`/`scroll.y` einer
 * virtuellen Tabelle auf `typeof … === "number"` und fällt sonst still auf
 * `x = 1` bzw. `y = 500` zurück. `typecheck` kennt `"max-content"` als gültigen
 * Wert, `build` serialisiert es klaglos, und jsdom rechnet keine Layoutboxen —
 * ein `mount()` sähe die zusammengefallene Tabelle also genauso wenig.
 *
 * Prüfbar ist die Entscheidung deshalb nur DORT, wo sie fällt: vor dem Rendern,
 * als Funktion von Spalten auf Zahlen.
 */
describe("breitenSumme", () => {
  it("summiert numerische Breiten", () => {
    expect(breitenSumme([{ width: 200 }, { width: 120 }, { width: 80 }])).toBe(400);
  });

  it("liefert null, sobald EINE Spalte keine Breite traegt", () => {
    expect(breitenSumme([{ width: 200 }, {}, { width: 80 }])).toBeNull();
  });

  it("wertet eine Prozentbreite NICHT als Breite", () => {
    // Eine Prozentangabe ist erst nach dem Layout eine Zahl. Sie zu addieren
    // ergaebe eine erfundene Pixelsumme — und genau die ginge still durch.
    expect(breitenSumme([{ width: 200 }, { width: "20%" }])).toBeNull();
  });

  it("zaehlt gruppierte Koepfe ueber ihre Blaetter", () => {
    expect(
      breitenSumme([
        { width: 100 },
        { children: [{ width: 60 }, { width: 40 }] },
      ]),
    ).toBe(200);
  });

  it("liefert null, wenn ein Blatt einer Gruppe keine Breite traegt", () => {
    expect(breitenSumme([{ children: [{ width: 60 }, {}] }])).toBeNull();
  });

  it("liefert null fuer eine leere oder fehlende Spaltenliste", () => {
    expect(breitenSumme([])).toBeNull();
    expect(breitenSumme(undefined)).toBeNull();
  });
});

describe("scrollMasse", () => {
  it("laesst eine gewoehnliche Tabelle nach Inhalt scrollen", () => {
    const ergebnis = scrollMasse([{ width: 100 }], false);
    expect(ergebnis.virtuellAktiv).toBe(false);
    expect(ergebnis.scroll).toEqual({ x: BREITE_NACH_INHALT });
    expect(ergebnis.hinweis).toBeUndefined();
  });

  it("rechnet bei vollstaendigen Breiten ZWEI Zahlen aus", () => {
    const ergebnis = scrollMasse([{ width: 240 }, { width: 160 }], 640);
    expect(ergebnis.virtuellAktiv).toBe(true);
    expect(ergebnis.scroll).toEqual({ x: 400, y: 640 });
    // Der eigentliche Punkt: BEIDE Werte sind Zahlen. Eine Zeichenkette hier
    // waere der stille Rueckfall auf `x = 1`.
    expect(typeof ergebnis.scroll?.x).toBe("number");
    expect(typeof ergebnis.scroll?.y).toBe("number");
  });

  it("schaltet die Virtualisierung AB, wenn eine Spaltenbreite fehlt", () => {
    const ergebnis = scrollMasse([{ width: 240 }, {}], 640);
    expect(ergebnis.virtuellAktiv).toBe(false);
    expect(ergebnis.scroll).toEqual({ x: BREITE_NACH_INHALT });
    expect(ergebnis.hinweis).toContain("numerische `width`");
  });

  it("behandelt eine unsinnige Hoehe wie ausgeschaltet", () => {
    expect(scrollMasse([{ width: 100 }], 0).virtuellAktiv).toBe(false);
    expect(scrollMasse([{ width: 100 }], -20).virtuellAktiv).toBe(false);
    expect(scrollMasse([{ width: 100 }], Number.NaN).virtuellAktiv).toBe(false);
  });

  it("rechnet die Auswahlspalte mit, die antd selbst hinzufuegt", () => {
    // Die Auswahlspalte steht nicht in `columns`. Ohne ihre Breite waere die
    // Gesamtbreite um genau diese Spalte zu schmal, und die letzte echte Spalte
    // geriete unter den waagerechten Rand — sichtbar nur im echten Browser.
    const ohne = scrollMasse([{ width: 240 }, { width: 160 }], 640);
    const mit = scrollMasse([{ width: 240 }, { width: 160 }], 640, undefined, 32);
    expect(ohne.scroll?.x).toBe(400);
    expect(mit.scroll?.x).toBe(432);
  });

  it("laesst die Zusatzbreite weg, wenn gar nicht virtualisiert wird", () => {
    const ergebnis = scrollMasse([{ width: 240 }], false, undefined, 32);
    expect(ergebnis.scroll).toEqual({ x: BREITE_NACH_INHALT });
  });

  it("virtualisiert unterhalb der Schwelle NICHT", () => {
    /**
     * Zwei Gruende, und der zweite ist der unangenehme: unterhalb der Schwelle
     * kostet Virtualisierung mehr als sie spart — UND eine virtuelle Tabelle
     * rendert in jsdom ueberhaupt keine Zeile, weil rc-virtual-list ohne
     * Layoutboxen auf null sichtbare Eintraege kommt. Ohne diese Schwelle waere
     * jeder DOM-Test gegen eine virtualisierte Tabelle blind, und zwar lautlos.
     */
    const spalten = [{ width: 240 }, { width: 160 }];
    expect(scrollMasse(spalten, 640, undefined, 0, { anzahl: 10 }).virtuellAktiv).toBe(false);
    expect(
      scrollMasse(spalten, 640, undefined, 0, { anzahl: VIRTUELL_AB_ZEILEN - 1 }).virtuellAktiv,
    ).toBe(false);
  });

  it("virtualisiert ab der Schwelle", () => {
    const spalten = [{ width: 240 }, { width: 160 }];
    expect(
      scrollMasse(spalten, 640, undefined, 0, { anzahl: VIRTUELL_AB_ZEILEN }).virtuellAktiv,
    ).toBe(true);
  });

  it("laesst den Aufrufer die Schwelle setzen", () => {
    const spalten = [{ width: 240 }];
    expect(scrollMasse(spalten, 640, undefined, 0, { anzahl: 5, ab: 3 }).virtuellAktiv).toBe(true);
    expect(scrollMasse(spalten, 640, undefined, 0, { anzahl: 2, ab: 3 }).virtuellAktiv).toBe(false);
  });

  it("entscheidet ohne Zeilenangabe allein nach `virtuell`", () => {
    expect(scrollMasse([{ width: 240 }], 640).virtuellAktiv).toBe(true);
  });

  it("schaltet die Vorgabe mit `false` ganz ab", () => {
    /**
     * Der Fall, den ein `??` verschluckt haette: `false` heisst „gar kein
     * `scroll`", nicht „nimm die Vorgabe". Er traegt eine Tabelle, die unter
     * 768px ohnehin ausgeblendet wird und deren Spalten `ellipsis` tragen —
     * dort gibt `max-content` der Tabelle einen eigenen Scrollcontainer, und
     * die Spalte, deren Aufgabe das Abschneiden ist, waechst stattdessen.
     */
    expect(scrollMasse([{ width: 100 }], false, false).scroll).toBeUndefined();
    expect(scrollMasse([{ width: 100 }], 640, false, 0, { anzahl: 5 }).scroll).toBeUndefined();
  });

  it("laesst eigene Scrollmasse einer gewoehnlichen Tabelle stehen", () => {
    const ergebnis = scrollMasse([{ width: 100 }], false, { x: 1200 });
    expect(ergebnis.scroll).toEqual({ x: 1200 });
  });
});
