import { describe, expect, it } from "vitest";
import { dekodiereText, einheitenAusListe, leseCsv, leseEinheitenCsv } from "./csv";

const latin1 = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0))); // Windows-1252 == Latin-1 für diese Zeichen

describe("dekodiereText — Excel speichert deutsche CSV als Windows-1252", () => {
  it("UTF-8 (mit und ohne BOM) bleibt UTF-8, sonst Windows-1252", () => {
    expect(dekodiereText(new TextEncoder().encode("KTW;Großenkneten"))).toBe("KTW;Großenkneten");
    expect(dekodiereText(new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("Übung")]))).toBe("Übung");
    expect(dekodiereText(latin1("KTW;RK Großenkneten 1;Übung"))).toBe("KTW;RK Großenkneten 1;Übung");
  });
});

describe("leseCsv — Semikolon, Anführungszeichen, Zeilenenden", () => {
  it("Felder in Anführungszeichen mit ; und \"\", CRLF und CR, Startzeile je Datensatz", () => {
    const r = leseCsv('Typ;Rufname;Notiz\r\nRTW;"RK UE; 40-83-5";"sagt ""hallo"""\rKTW;"zwei\nZeilen";x\nNEF;RK 3;\n');
    expect(r.fehler).toBeNull();
    expect(r.saetze).toEqual([
      { zeile: 1, felder: ["Typ", "Rufname", "Notiz"] },
      { zeile: 2, felder: ["RTW", "RK UE; 40-83-5", 'sagt "hallo"'] },
      { zeile: 3, felder: ["KTW", "zwei\nZeilen", "x"] },
      { zeile: 5, felder: ["NEF", "RK 3", ""] }, // der Umbruch IM Feld zählt mit (Review Phase 4)
    ]);
  });
  it("ein Anführungszeichen MITTEN im Feld ist Text, kein Feldanfang", () => {
    expect(leseCsv('RTW;RK "Nord" 1;x').saetze).toEqual([{ zeile: 1, felder: ["RTW", 'RK "Nord" 1', "x"] }]);
  });
  it("ein nicht geschlossenes Anführungszeichen ist ein Fehler mit Zeile", () => {
    expect(leseCsv('RTW;"offen\nKTW;x').fehler).toBe("Zeile 1: Ein Anführungszeichen wird nicht geschlossen.");
  });
});

describe("leseEinheitenCsv — Typ;Rufname[;Notiz] (Entscheidung 12)", () => {
  it("Kopfzeile erkannt, Leerzeilen übersprungen, leere Notiz null, angehängte leere Spalten aus Excel geduldet", () => {
    expect(leseEinheitenCsv("﻿typ;RUFNAME;notiz\n\nRTW;RK UE 40-83-5;\nKTW; RK UE 40-92-1 ;Reserve;;\n")).toEqual({
      zeilen: [
        { zeile: 3, typ: "RTW", rufname: "RK UE 40-83-5", notiz: null },
        { zeile: 4, typ: "KTW", rufname: "RK UE 40-92-1", notiz: "Reserve" },
      ],
      fehler: [],
    });
  });
  it("ohne Kopfzeile ist die erste Zeile Daten", () => {
    expect(leseEinheitenCsv("RTW;RK 1").zeilen).toEqual([{ zeile: 1, typ: "RTW", rufname: "RK 1", notiz: null }]);
    // Kopfzeile nur, wenn BEIDE Spalten so heißen — „Typ“ allein in Spalte 1 ist kein Beleg
    expect(leseEinheitenCsv("Typ;RK 1").zeilen).toEqual([{ zeile: 1, typ: "Typ", rufname: "RK 1", notiz: null }]);
  });
  it("Fehler je Zeile: vier Spalten mit Inhalt, Rufname fehlt (Komma statt Semikolon), Typ fehlt, zu lang", () => {
    const r = leseEinheitenCsv(`RTW;RK 1;a;b\nKTW,RK 2\n;RK 3\nRTW;${"x".repeat(81)}`);
    expect(r.fehler).toEqual([
      "Zeile 1: Mehr als drei Spalten — erwartet wird Typ;Rufname;Notiz.",
      "Zeile 2: Der Rufname fehlt (Trennzeichen ist das Semikolon).",
      "Zeile 3: Der Typ fehlt.",
      "Zeile 4: Der Rufname ist länger als 80 Zeichen.",
    ]);
    expect(r.zeilen).toEqual([]);
  });
  it("über 500 Zeilen: ein Fehler mit der Zahl", () => {
    const text = Array.from({ length: 501 }, (_, i) => `KTW;K ${i}`).join("\n");
    expect(leseEinheitenCsv(text).fehler).toEqual(["Höchstens 500 Zeilen je Import — hier sind es 501."]);
  });
});

describe("einheitenAusListe — derselbe Parser wie „Liste einfügen“ im Flyin", () => {
  it("erstes Wort Typ, Rest Rufname; Zeilennummern; ein Typ ohne Rufname ist hier ein Fehler", () => {
    expect(einheitenAusListe("RTW RK UE 40-83-5\n\n\tKTW   RK UE 40-92-1\nNEF")).toEqual({
      zeilen: [
        { zeile: 1, typ: "RTW", rufname: "RK UE 40-83-5", notiz: null },
        { zeile: 3, typ: "KTW", rufname: "RK UE 40-92-1", notiz: null },
      ],
      fehler: ["Zeile 4: Der Rufname fehlt."],
    });
  });
});
