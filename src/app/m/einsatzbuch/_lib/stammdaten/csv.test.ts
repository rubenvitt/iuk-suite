import { describe, expect, it } from "vitest";
import { dekodiere, parseCsv, planeImport, type Importbestand } from "./csv";

const LEER: Importbestand = { fahrzeuge: [], personal: [], stichworte: [] };
const win1252 = (s: string) =>
  Uint8Array.from([...s].map((c) => ({ ü: 0xfc, ß: 0xdf, ä: 0xe4 } as Record<string, number>)[c] ?? c.charCodeAt(0)));

describe("dekodiere", () => {
  it("UTF-8 mit BOM, UTF-8 ohne BOM, Windows-1252", () => {
    expect(dekodiere(new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("Jürgens")]))).toBe("Jürgens");
    expect(dekodiere(new TextEncoder().encode("Voß"))).toBe("Voß");
    expect(dekodiere(win1252("Jürgens;Voß"))).toBe("Jürgens;Voß");
  });
});

describe("parseCsv", () => {
  it("Semikolon, Anführungszeichen mit Trennzeichen und Zeilenumbruch darin, CRLF", () => {
    expect(parseCsv('name;quali;ov\r\n"Voß, Anke";SanH;"Bad; Bevensen"\r\n"Otte, ""Ole""";RS;Uelzen\r\n')).toEqual([
      ["name", "quali", "ov"], ["Voß, Anke", "SanH", "Bad; Bevensen"], ['Otte, "Ole"', "RS", "Uelzen"],
    ]);
  });
  it("Komma und Tab als Trennzeichen, Leerzeilen fallen weg", () => {
    expect(parseCsv("gruppe,name,reihenfolge\n\nMANV,MANV 5,1\n")).toEqual([["gruppe", "name", "reihenfolge"], ["MANV", "MANV 5", "1"]]);
    expect(parseCsv("typ\tkennung\n RTW \t11-83-1")).toEqual([["typ", "kennung"], [" RTW ", "11-83-1"]]);
  });
});

describe("planeImport", () => {
  const bestand: Importbestand = {
    ...LEER,
    fahrzeuge: [
      { id: "f1", typ: "RTW", kennung: "11-83-1", ruf: "Rotkreuz Uelzen 11-83-1", standort: "Uelzen", aktiv: true },
      { id: "f2", typ: "KTW-B", kennung: "11-85-1", ruf: "Rotkreuz Uelzen 11-85-1", standort: "Uelzen", aktiv: false },
    ],
    personal: [
      { id: "p1", name: "Albers, Jana", quali: "ZF", ov: "Uelzen", aktiv: true },
      { id: "p2", name: "Meyer, Hanna", quali: "BtH", ov: "Rosche", aktiv: true },
      { id: "p3", name: "Meyer, Hanna", quali: "SanH", ov: "Uelzen", aktiv: true },
    ],
  };
  it("klassifiziert neu, geändert (auch reaktiviert), unverändert und Fehler", () => {
    const plan = planeImport("fahrzeuge", [
      "typ;kennung;ruf;standort",
      "RTW;11-83-1;Rotkreuz Uelzen 11-83-1;Uelzen",
      "KTW-B;11-85-1;Rotkreuz Uelzen 11-85-1;Uelzen",
      "MTF;11-19-1;Rotkreuz Uelzen 11-19-1;Uelzen",
      "MTF;;ohne Kennung;Uelzen",
      "MTF;11-19-1;doppelt;Uelzen",
    ].join("\n"), bestand);
    expect(plan.ok && plan.zeilen.map((z) => [z.zeile, z.klasse])).toEqual([[2, "unveraendert"], [3, "geaendert"], [4, "neu"], [5, "fehler"], [6, "fehler"]]);
    expect(plan.ok && plan.zeilen[3].fehler).toBe("Kennung fehlt");
    expect(plan.ok && plan.zeilen[4].fehler).toBe("Kennung steht schon in Zeile 4");
    expect(plan.ok && plan.zeilen[1].id).toBe("f2");
  });
  it("Person: mehrdeutiger Name ist eine Fehlerzeile", () => {
    const plan = planeImport("personal", "name;quali;ov\nMeyer, Hanna;SanH;Uelzen\nAlbers, Jana;GF;Uelzen", bestand);
    expect(plan.ok && plan.zeilen.map((z) => z.klasse)).toEqual(["fehler", "geaendert"]);
    expect(plan.ok && plan.zeilen[0].fehler).toBe("mehrdeutig: 2 Personen heißen so");
  });
  it("falsche Kopfzeile, falsche Spaltenzahl, leere Datei, zu viele Zeilen", () => {
    expect(planeImport("personal", "name;ov;quali\nA, B;SanH;Uelzen", LEER)).toEqual({ ok: false, fehler: "Die Kopfzeile muss genau „name;quali;ov“ lauten." });
    const zu = planeImport("personal", "name;quali;ov\nA, B;SanH", LEER);
    expect(zu.ok && zu.zeilen[0].fehler).toBe("3 Spalten erwartet, 2 gefunden");
    expect(planeImport("personal", "", LEER)).toEqual({ ok: false, fehler: "Die Datei ist leer." });
    const viele = "name;quali;ov\n" + Array.from({ length: 2001 }, (_, i) => `N${i}, V;SanH;Uelzen`).join("\n");
    expect(planeImport("personal", viele, LEER)).toEqual({ ok: false, fehler: "Höchstens 2000 Zeilen je Import." });
  });
  it("Stichwort: Reihenfolge muss eine Zahl sein", () => {
    const plan = planeImport("stichworte", "gruppe;name;reihenfolge\nMANV;MANV 5;erste", LEER);
    expect(plan.ok && plan.zeilen[0].klasse).toBe("fehler");
  });
});
