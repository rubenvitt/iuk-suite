import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { bestellListeText } from "./bestellText";

const ZEILEN = [
  { vorschlag: 8,  name: "Mullbinde 8cm",   bestellt: false },
  { vorschlag: 40, name: "Kompresse 10x10", bestellt: true  },
  { vorschlag: 25, name: 'Handschuh "M"',   bestellt: false },
];

describe("bestellListeText", () => {
  it("liefert die Beispielausgabe aus §9.3 zeichengleich", () => {
    expect(bestellListeText(ZEILEN)).toBe(
      '8 × Mullbinde 8cm\n25 × Handschuh "M"',
    );
  });

  /**
   * U+00D7 MULTIPLICATION SIGN, NICHT ASCII "x" (BestellListe.tsx:25). Der
   * Unterschied ist am Bildschirm kaum sichtbar und in einer Bestell-Mail sehr
   * wohl. Der Test prueft den CODEPOINT, nicht das Zeichen — eine Datei, die
   * jemand versehentlich nach Latin-1 speichert, faellt sonst nicht auf.
   */
  it("benutzt U+00D7 und nirgends ein ASCII-x", () => {
    const text = bestellListeText(ZEILEN);
    expect(text).toContain("×");
    expect(text.codePointAt(text.indexOf(" ") + 1)).toBe(0x00d7);
    expect(text).not.toMatch(/\d x /);
  });

  /**
   * ZEILENUMFANG: nur die noch NICHT bestellten (BestellListe.tsx:25 —
   * `filter((z) => !z.bestellt)`). Die CSV nimmt alle. Die beiden Wege sitzen
   * als zwei Knoepfe auf EINEM Bildschirm und liefern verschieden viele Zeilen;
   * Entscheidung 9-A laesst das so und beschriftet es stattdessen.
   */
  it("laesst bereits bestellte Zeilen weg", () => {
    expect(bestellListeText(ZEILEN)).not.toContain("Kompresse");
    expect(bestellListeText(ZEILEN).split("\n")).toHaveLength(2);
  });

  it("liefert bei nichts Offenem einen leeren String, keine Leerzeile", () => {
    expect(bestellListeText([{ vorschlag: 1, name: "X", bestellt: true }])).toBe("");
    expect(bestellListeText([])).toBe("");
  });

  /**
   * KEIN "use client" — Falle 6. `bestellText.ts` liefert einen WERT
   * (`bestellListeText`), den T166s Client-Insel importiert; mit "use client"
   * bekaeme ein Server-Konsument eine Client-Referenz statt der Funktion.
   * K-4: ohneKommentare() statt Rohtext-Scan — `bestellText.ts` traegt den
   * Satz „kein \"use client\"" woertlich in seinem eigenen Kopfkommentar, der
   * Scan waere sonst auf seiner eigenen Begruendung rot (vgl. bereits behobenen
   * Selbstbezug in etikettMasse.test.ts / pwaIcons.test.ts / csvBestellung.test.ts).
   */
  it("traegt kein use client", () => {
    const quelle = readFileSync(join(__dirname, "bestellText.ts"), "utf8");
    expect(ohneKommentare(quelle)).not.toMatch(/["']use client["']/);
  });
});

/**
 * Kopie von `ohneKommentare()` aus `_lib/bauform.test.ts` (K-4, Regel 1 der
 * Regeldatei fuer Teil 4). `bauform.test.ts` exportiert die Funktion nicht,
 * und diese Datei ist ein anderer Testkoerper, deshalb die lokale Kopie statt
 * eines Re-Exports.
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
