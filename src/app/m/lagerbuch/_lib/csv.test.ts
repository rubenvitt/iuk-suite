import { describe, expect, it } from "vitest";
import { parseArtikelCsv } from "./csv";

describe("parseArtikelCsv", () => {
  it("liest Semikolon-Dokumente mit vollstaendiger Kopfzeile", () => {
    const ergebnis = parseArtikelCsv(
      "Name;Einheit;Fach;Mindestbestand;Startbestand\n"
      + "Mull;Stk;A1;20;5\n"
      + "Kompressen;Pkg;B2;10;0\n",
    );

    expect(ergebnis).toEqual({
      rows: [
        { name: "Mull", einheit: "Stk", fach: "A1", mindestbestand: 20, startbestand: 5 },
        { name: "Kompressen", einheit: "Pkg", fach: "B2", mindestbestand: 10, startbestand: 0 },
      ],
      errors: [],
    });
  });

  it("nimmt ein Komma-Dokument, wenn die erste nichtleere Zeile kein Semikolon enthaelt", () => {
    const ergebnis = parseArtikelCsv(
      "Name,Einheit,Fach,Mindestbestand,Startbestand\nMull,Stk,A1,20,5",
    );

    expect(ergebnis.rows).toEqual([
      { name: "Mull", einheit: "Stk", fach: "A1", mindestbestand: 20, startbestand: 5 },
    ]);
    expect(ergebnis.errors).toEqual([]);
  });

  it("waehlt das Trennzeichen einmal je Dokument und behaelt Kommas in Semikolon-Feldern", () => {
    const ergebnis = parseArtikelCsv(
      "Name;Einheit;Fach;Mindestbestand;Startbestand\n"
      + "Mull, steril;Stk;A1;20;5\n"
      + "Falsches,Stk,A2,10,1",
    );

    expect(ergebnis.rows).toEqual([
      { name: "Mull, steril", einheit: "Stk", fach: "A1", mindestbestand: 20, startbestand: 5 },
    ]);
    expect(ergebnis.errors).toEqual([
      "Zeile 3: erwartet 5 Spalten (Name, Einheit, Fach, Mindestbestand, Startbestand), gefunden 1.",
    ]);
  });

  it("lehnt auch eine sechste Spalte mit Zeilennummer ab", () => {
    const ergebnis = parseArtikelCsv(
      "Name;Einheit;Fach;Mindestbestand;Startbestand\nMull;Stk;A1;20;5;ignoriert",
    );

    expect(ergebnis.rows).toEqual([]);
    expect(ergebnis.errors).toEqual([
      "Zeile 2: erwartet 5 Spalten (Name, Einheit, Fach, Mindestbestand, Startbestand), gefunden 6.",
    ]);
  });

  it("erkennt eine Kopfzeile nur bei allen fuenf Namen", () => {
    const ergebnis = parseArtikelCsv(
      "Name;Einheit;Fach;Minimum;Start\nMull;Stk;A1;20;5",
    );

    expect(ergebnis.rows).toEqual([
      { name: "Mull", einheit: "Stk", fach: "A1", mindestbestand: 20, startbestand: 5 },
    ]);
    expect(ergebnis.errors).toEqual([
      "Zeile 1: Mindestbestand „Minimum“ ist keine ganze Zahl ≥ 0.",
    ]);
  });

  it("findet die Kopfzeile als erste nichtleere Zeile und verarbeitet BOM und CRLF", () => {
    const ergebnis = parseArtikelCsv(
      "﻿\r\n  \r\nNAME;EINHEIT;FACH;MINDESTBESTAND;STARTBESTAND\r\nMull;Stk;A1;1;0\r\n",
    );

    expect(ergebnis.rows).toEqual([
      { name: "Mull", einheit: "Stk", fach: "A1", mindestbestand: 1, startbestand: 0 },
    ]);
    expect(ergebnis.errors).toEqual([]);
  });

  it("kommt ohne Kopfzeile aus", () => {
    expect(parseArtikelCsv("Mull;Stk;A1;20;5")).toEqual({
      rows: [
        { name: "Mull", einheit: "Stk", fach: "A1", mindestbestand: 20, startbestand: 5 },
      ],
      errors: [],
    });
  });

  it("liefert physische Zeilennummern nur ueber den expliziten Metadatenpfad", () => {
    const text = "Name;Einheit;Fach;Mindestbestand;Startbestand\n\nMull;Stk;A1;20;5";
    const row = {
      name: "Mull",
      einheit: "Stk",
      fach: "A1",
      mindestbestand: 20,
      startbestand: 5,
    };

    expect(parseArtikelCsv(text)).toEqual({ rows: [row], errors: [] });
    expect(parseArtikelCsv(text, { mitMetadaten: true })).toEqual({
      rows: [{ row, zeile: 3 }],
      errors: [],
    });
  });

  it("meldet zu wenige Spalten an der physischen Zeilennummer und liest spaetere Zeilen", () => {
    const ergebnis = parseArtikelCsv(
      "Name;Einheit;Fach;Mindestbestand;Startbestand\n\nMull;Stk\nA;B;C;1;0",
    );

    expect(ergebnis.rows).toEqual([
      { name: "A", einheit: "B", fach: "C", mindestbestand: 1, startbestand: 0 },
    ]);
    expect(ergebnis.errors).toEqual([
      "Zeile 3: erwartet 5 Spalten (Name, Einheit, Fach, Mindestbestand, Startbestand), gefunden 2.",
    ]);
  });

  it.each([
    {
      zeile: "Mull;Stk;A1;viele;0",
      fehler: "Zeile 2: Mindestbestand „viele“ ist keine ganze Zahl ≥ 0.",
    },
    {
      zeile: "Mull;Stk;A1;1;-1",
      fehler: "Zeile 2: Startbestand „-1“ ist keine ganze Zahl ≥ 0.",
    },
    {
      zeile: "Mull;Stk;A1;;0",
      fehler: "Zeile 2: Mindestbestand „“ ist keine ganze Zahl ≥ 0.",
    },
  ])("weist ungueltige Mengen fest zurueck: $zeile", ({ zeile, fehler }) => {
    const ergebnis = parseArtikelCsv(
      `Name;Einheit;Fach;Mindestbestand;Startbestand\n${zeile}`,
    );

    expect(ergebnis.rows).toEqual([]);
    expect(ergebnis.errors).toEqual([fehler]);
  });

  it("ueberspringt leere Zeilen, aber nicht leere Pflichtfelder", () => {
    const ergebnis = parseArtikelCsv(
      "Name;Einheit;Fach;Mindestbestand;Startbestand\n\nMull;;A1;1;0\n\n",
    );

    expect(ergebnis.rows).toEqual([]);
    expect(ergebnis.errors).toEqual([
      "Zeile 3: Name, Einheit und Fach dürfen nicht leer sein.",
    ]);
  });
});
