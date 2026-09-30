import { describe, expect, it } from "vitest";
import { leseEinheitenliste, leseGliederung } from "./einfuegen";
import { LAENGE } from "./schema";

describe("Liste einfügen (Spec §6.4)", () => {
  it("erstes Wort ist der Typ, der Rest der Rufname; Leerzeilen, Tabs und Mehrfachleerzeichen stören nicht", () => {
    expect(leseEinheitenliste("RTW RK UE 40-83-5\n\n  KTW\tRK UE 40-92-1  \r\nELW1   RK  UE 40-10-1\n")).toEqual({
      einheiten: [
        { typ: "RTW", rufname: "RK UE 40-83-5" },
        { typ: "KTW", rufname: "RK UE 40-92-1" },
        { typ: "ELW1", rufname: "RK UE 40-10-1" },
      ],
      fehler: [],
    });
  });
  it("ein einzelnes Wort ist ein Typ ohne Rufnamen", () => {
    expect(leseEinheitenliste("MTW").einheiten).toEqual([{ typ: "MTW", rufname: "" }]);
  });
  it("zu lange Typen und Rufnamen werden als Fehler mit Zeilennummer gemeldet, nicht gekürzt (Review Focus 2)", () => {
    const r = leseEinheitenliste(`RTW RK 1\n\n${"T".repeat(LAENGE.typ + 1)} X\nKTW ${"R".repeat(LAENGE.rufname + 1)}`);
    expect(r.fehler).toEqual([
      `Zeile 3: Der Typ ist länger als ${LAENGE.typ} Zeichen.`,
      `Zeile 4: Der Rufname ist länger als ${LAENGE.rufname} Zeichen.`,
    ]);
    expect(r.einheiten).toEqual([{ typ: "RTW", rufname: "RK 1" }]);
  });
  it("leere Eingabe: nichts, kein Fehler", () => {
    expect(leseEinheitenliste("  \n\t\n")).toEqual({ einheiten: [], fehler: [] });
  });
});

describe("leseGliederung (Spec §6.5, Entscheidung 9)", () => {
  const ebenen = (text: string) => leseGliederung(text).eintraege.map((e) => [e.ebene, e.titel]);

  it("Tabs und je zwei Leerzeichen sind dieselbe Ebene — auch gemischt", () => {
    expect(ebenen("EL\n\tEA 1\n  EA 2\n\t\tRTW 1\n    RTW 2")).toEqual([[0, "EL"], [1, "EA 1"], [1, "EA 2"], [2, "RTW 1"], [2, "RTW 2"]]);
  });
  it("vier Leerzeichen je Ebene und geschützte Leerzeichen gehen ebenso", () => {
    expect(ebenen("EL\n    EA\n        RTW")).toEqual([[0, "EL"], [1, "EA"], [2, "RTW"]]);
    expect(ebenen("EL\n  EA")).toEqual([[0, "EL"], [1, "EA"]]);
  });
  it("ein Sprung über mehrere Ebenen ist genau eine Ebene tiefer; zwischen zwei Stufen zählt die tiefere", () => {
    expect(ebenen("EL\n\t\t\tEA\n\t\t\t\tRTW\n\tEB")).toEqual([[0, "EL"], [1, "EA"], [2, "RTW"], [1, "EB"]]);
  });
  it("eine eingerückte erste Zeile ist Ebene 0; weniger eingerückte danach ebenfalls", () => {
    expect(ebenen("    EL\n      EA\nStab")).toEqual([[0, "EL"], [1, "EA"], [0, "Stab"]]);
  });
  it("Aufzählungszeichen und Nummern werden abgestreift — nur mit folgendem Leerraum", () => {
    expect(ebenen("- EL\n  * EA 1\n  • EA 2\n  1. EA 3\n  2) EA 4\n  2.1. EA 5\n  –\tEA 6")).toEqual(
      [[0, "EL"], [1, "EA 1"], [1, "EA 2"], [1, "EA 3"], [1, "EA 4"], [1, "EA 5"], [1, "EA 6"]]);
    expect(ebenen("112 Leitstelle\n1.2 Abschnitt\n-5 Grad\n2.OG")).toEqual([[0, "112 Leitstelle"], [0, "1.2 Abschnitt"], [0, "-5 Grad"], [0, "2.OG"]]);
  });
  it("Zeilen, die wie Fahrzeuge aussehen, werden nicht geraten: jede Zeile ist eine Stelle", () => {
    expect(ebenen("EA 1\n\tRTW RK UE 40-83-5\n\tKTW 40-92-1")).toEqual([[0, "EA 1"], [1, "RTW RK UE 40-83-5"], [1, "KTW 40-92-1"]]);
  });
  it("CRLF, CR, Leerzeilen und reine Leerraumzeilen; innerer Leerraum wird ein Leerzeichen", () => {
    expect(ebenen("EL\r\n\r\n\tEA  1\r   \n\t- \nStab")).toEqual([[0, "EL"], [1, "EA 1"], [0, "Stab"]]);
  });
  it("ein zu langer Titel ist ein Fehler mit Zeilennummer — nie still gekürzt", () => {
    const r = leseGliederung(`EL\n\t${"x".repeat(LAENGE.titel + 1)}\n\tEA`);
    expect(r.fehler).toEqual([`Zeile 2: Der Titel ist länger als ${LAENGE.titel} Zeichen.`]);
    expect(r.eintraege.map((e) => e.titel)).toEqual(["EL", "EA"]);
    expect(leseGliederung(`EL\n${"y".repeat(LAENGE.titel)}`).fehler).toEqual([]);
  });
  it("eine fehlerhafte Zeile verschiebt die Einrückung der übrigen nicht — die Zusicherung gilt auch mit Fehlern", () => {
    const lang = "x".repeat(LAENGE.titel + 1);
    expect(ebenen(`A\n\t${lang}\n\t\tB`)).toEqual([[0, "A"], [1, "B"]]);
    expect(ebenen(`${lang}\n\tA\nB`)).toEqual([[0, "A"], [0, "B"]]);
  });
  it("leerer Text: nichts", () => {
    expect(leseGliederung("")).toEqual({ eintraege: [], fehler: [] });
    expect(leseGliederung(" \n\t\n")).toEqual({ eintraege: [], fehler: [] });
  });
  it("Zusicherung: erste Ebene 0, danach höchstens eine Ebene tiefer (Zufallstexte, auch mit zu langen Zeilen)", () => {
    let saat = 7;
    const zufall = () => { saat = (saat * 1103515245 + 12345) % 2 ** 31; return saat / 2 ** 31; };
    for (let n = 0; n < 200; n++) {
      const zeilen = Array.from({ length: 1 + Math.floor(zufall() * 12) }, (_, i) =>
        `${["", "\t", "  ", "    ", "\t  ", " "][Math.floor(zufall() * 6)].repeat(Math.floor(zufall() * 4))}${["- ", "", "1. ", "• "][Math.floor(zufall() * 4)]}${zufall() < 0.1 ? "x".repeat(LAENGE.titel + 1) : `S${i}`}`); // jede zehnte Zeile zu lang
      const e = leseGliederung(zeilen.join(zufall() < 0.5 ? "\n" : "\r\n")).eintraege;
      if (e.length === 0) continue;
      expect(e[0].ebene).toBe(0);
      for (let i = 1; i < e.length; i++) expect(e[i].ebene).toBeLessThanOrEqual(e[i - 1].ebene + 1);
    }
  });
});
