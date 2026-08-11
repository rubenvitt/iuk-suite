import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { csvZelle, csvTextZelle } from "./csvZelle";
import {
  BESTELL_CSV_KOEPFE, BESTELL_CSV_DATEINAME, baueBestellCsv,
  type BestellCsvZeile,
} from "./csvBestellung";

const ZEILEN: BestellCsvZeile[] = [
  { name: "Mullbinde 8cm",  bestand: 12, mindestbestand: 20, vorschlag: 8,  einheit: "Stk.", bestellt: false },
  { name: "Kompresse 10x10", bestand: 0, mindestbestand: 40, vorschlag: 40, einheit: "Pkg.", bestellt: true  },
  { name: 'Handschuh "M"',  bestand: 5,  mindestbestand: 30, vorschlag: 25, einheit: "Paar", bestellt: false },
];

describe("csvZelle", () => {
  /** 1:1 aus BestellListe.tsx:8. Aendert NIE den Zellinhalt. */
  it("quotet jede Zelle und verdoppelt enthaltene Anfuehrungszeichen", () => {
    expect(csvZelle("Mullbinde")).toBe('"Mullbinde"');
    expect(csvZelle('Handschuh "M"')).toBe('"Handschuh ""M"""');
    expect(csvZelle(12)).toBe('"12"');
  });

  /**
   * ENTSCHEIDUNG 9-C: Neutralisierung NUR auf Textspalten. Die Trennung ist
   * genau die Stelle, an der eine Ein-Zeilen-Loesung falsch waere.
   */
  it("neutralisiert ein fuehrendes =/+/-/@ nur ueber csvTextZelle", () => {
    expect(csvTextZelle("=1+1")).toBe(`"'=1+1"`);
    expect(csvTextZelle("+49")).toBe(`"'+49"`);
    expect(csvTextZelle("-Rest")).toBe(`"'-Rest"`);
    expect(csvTextZelle("@mail")).toBe(`"'@mail"`);
  });

  it("laesst harmlose Texte unberuehrt", () => {
    expect(csvTextZelle("Mullbinde 8cm")).toBe('"Mullbinde 8cm"');
    expect(csvTextZelle("A2-Fach")).toBe('"A2-Fach"');  // Minus NICHT am Anfang
  });

  /**
   * DIE ZEILE, WEGEN DER DIE NEUTRALISIERUNG NICHT IN csvZelle GEHOERT: `-` ist
   * zugleich das Vorzeichen. `"'-3"` kaeme in jeder Kalkulation als TEXT an und
   * machte die Spalte unsummierbar — still, weil heute kein Buchungsweg einen
   * negativen Bestand erzeugt (I2, §5.2.2).
   */
  it("laesst eine negative ZAHL unangetastet", () => {
    expect(csvZelle(-3)).toBe('"-3"');
    expect(csvZelle(-3)).not.toContain("'");
  });
});

describe("baueBestellCsv", () => {
  it("traegt sechs Koepfe in dieser Reihenfolge", () => {
    expect(BESTELL_CSV_KOEPFE).toEqual([
      "Artikel", "Bestand", "Mindestbestand", "Vorschlag", "Einheit", "Status",
    ]);
  });

  it("trennt mit Semikolon, nicht mit Komma", () => {
    const kopf = baueBestellCsv([]).split("\n")[0];
    expect(kopf).toBe('"Artikel";"Bestand";"Mindestbestand";"Vorschlag";"Einheit";"Status"');
  });

  /**
   * Die Kopfzeile laeuft durch csvZelle, NICHT durch csvTextZelle: sie besteht
   * aus festen Literalen, und ein Apostroph davor waere eine Formataenderung
   * ohne jeden Anlass (§9.2).
   */
  it("neutralisiert die Kopfzeile nicht", () => {
    expect(baueBestellCsv([]).split("\n")[0]).not.toContain("'");
  });

  it("gibt die Beispielausgabe aus §9.2 zeichengleich zurueck", () => {
    expect(baueBestellCsv(ZEILEN)).toBe(
      '"Artikel";"Bestand";"Mindestbestand";"Vorschlag";"Einheit";"Status"\n' +
      '"Mullbinde 8cm";"12";"20";"8";"Stk.";"offen"\n' +
      '"Kompresse 10x10";"0";"40";"40";"Pkg.";"bestellt"\n' +
      '"Handschuh ""M""";"5";"30";"25";"Paar";"offen"',
    );
  });

  it("nennt den Status genau `bestellt` bzw. `offen`", () => {
    const zeilen = baueBestellCsv(ZEILEN).split("\n").slice(1);
    expect(zeilen[0].endsWith('"offen"')).toBe(true);
    expect(zeilen[1].endsWith('"bestellt"')).toBe(true);
  });

  /**
   * BYTE-VERGLEICH, kein Textvergleich: nur er sieht ein fehlendes BOM. Beide
   * Eigenschaften sind heutiges Verhalten (BestellListe.tsx:31) und damit
   * 1:1-Pflicht — ein nachgeruestetes BOM kann einen Abnehmer stromabwaerts
   * brechen, ohne dass es im Modul sichtbar wird (§9.2).
   */
  it("traegt kein Byte-Order-Mark und `\\n` statt CRLF", () => {
    const bytes = Buffer.from(baueBestellCsv(ZEILEN), "utf8");
    expect(bytes[0]).not.toBe(0xef);          // EF BB BF waere das UTF-8-BOM
    expect(bytes.includes(0x0d)).toBe(false); // kein CR irgendwo
    expect(bytes.includes(0x0a)).toBe(true);  // aber LF
  });

  it("haelt den Dateinamen konstant und ohne Datum", () => {
    expect(BESTELL_CSV_DATEINAME).toBe("bestellvorschlag.csv");
    expect(BESTELL_CSV_DATEINAME).not.toMatch(/\d/);
  });

  /**
   * ZEILENUMFANG: ALLE Zeilen, auch die bereits als bestellt markierten
   * (BestellListe.tsx:30 — kein Filter). Die Zwischenablage nimmt nur die
   * offenen; die beiden Wege duerfen auseinanderlaufen und tun es (9-A).
   */
  it("nimmt auch die bereits bestellten Zeilen mit", () => {
    expect(baueBestellCsv(ZEILEN).split("\n")).toHaveLength(1 + 3);
  });

  it("traegt in beiden Dateien kein use client", () => {
    // K-4: ohneKommentare() statt Rohtext-Scan — beide Dateien tragen den Satz
    // "kein \"use client\"" woertlich in ihrem Kopfkommentar (vgl. den bereits
    // behobenen Selbstbezug in etikettMasse.test.ts / pwaIcons.test.ts).
    for (const datei of ["csvZelle.ts", "csvBestellung.ts"]) {
      const quelle = readFileSync(join(__dirname, datei), "utf8");
      expect(ohneKommentare(quelle), datei).not.toMatch(/["']use client["']/);
    }
  });
});

/**
 * Kopie von `ohneKommentare()` aus `_lib/bauform.test.ts` (K-4, Regel 1 der
 * Regeldatei fuer Teil 4). Der Scan oben liest sonst den Rohtext INKLUSIVE
 * Kommentaren, und sowohl `csvZelle.ts` als auch `csvBestellung.ts` tragen den
 * Satz „kein \"use client\"" woertlich in ihrem eigenen Kopfkommentar — der
 * Scan waere auf seiner eigenen Begruendung rot. `bauform.test.ts` exportiert
 * die Funktion nicht, und diese Datei ist ein anderer Testkoerper, deshalb die
 * lokale Kopie statt eines Re-Exports.
 */
function ohneKommentare(quelle: string): string {
  let imBlock = false;
  return quelle
    .split("\n")
    .map((zeile) => {
      if (imBlock) {
        const zu = zeile.indexOf("*/");
        if (zu === -1) return "";
        imBlock = false;
        return " ".repeat(zu + 2) + zeile.slice(zu + 2);
      }
      const auf = zeile.indexOf("/*");
      if (auf !== -1 && !zeile.slice(0, auf).includes("*/")) {
        const zu = zeile.indexOf("*/", auf + 2);
        if (zu === -1) { imBlock = true; return zeile.slice(0, auf); }
        return zeile.slice(0, auf) + " ".repeat(zu + 2 - auf) + zeile.slice(zu + 2);
      }
      return zeile.trimStart().startsWith("//") ? "" : zeile;
    })
    .join("\n");
}
