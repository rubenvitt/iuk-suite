import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { blatt } from "@/core/export";
import {
  BESTELL_BLATTNAME,
  BESTELL_DATEINAME,
  BESTELL_SPALTEN,
  type BestellExportZeile,
} from "./bestellExport";

/**
 * DER VERTRAG `bestellvorschlag.xlsx` (DRK-186 — vormals `csvBestellung.test.ts`
 * und `bestellvorschlag.csv`).
 *
 * ⛔ WAS DIESER TEST FESTHÄLT UND WAS NICHT MEHR. Die sechs Köpfe, ihre
 * Reihenfolge und die Status-Literale sind unverändert aus dem CSV-Vertrag
 * übernommen und bleiben bewacht — nur der Behälter ist ein anderer. Was
 * WEGGEFALLEN ist, sind die Zusagen über den Behälter selbst: Semikolon als
 * Trennzeichen, jede Zelle gequotet, `\n` statt CRLF, kein BOM. Sie waren der
 * Dialekt einer Textdatei; eine Mappe hat keinen.
 */

const ZEILEN: BestellExportZeile[] = [
  { name: "Mullbinde 8cm", bestand: 3, mindestbestand: 10, vorschlag: 7, einheit: "Stk", bestellt: false },
  { name: "=SUMME(A1)", bestand: 0, mindestbestand: 5, vorschlag: 5, einheit: "Pck", bestellt: true },
  { name: 'Handschuh "M"', bestand: 2, mindestbestand: 4, vorschlag: 2, einheit: "Paar", bestellt: false },
];

describe("BESTELL_SPALTEN", () => {
  it("traegt die sechs Koepfe in unveraenderter Reihenfolge", () => {
    expect(BESTELL_SPALTEN.map((s) => s.kopf)).toEqual([
      "Artikel", "Bestand", "Mindestbestand", "Vorschlag", "Einheit", "Status",
    ]);
  });

  it("nennt den Status „bestellt“ bzw. „offen“, wie im Bestand", () => {
    const [, zeile1, zeile2] = blatt(BESTELL_BLATTNAME, BESTELL_SPALTEN, ZEILEN).daten;
    expect(zeile1[5]).toEqual({ value: "offen", type: String });
    expect(zeile2[5]).toEqual({ value: "bestellt", type: String });
  });

  /**
   * ⛔ DIE ZAHLENSPALTEN SIND ZAHLEN. Im CSV-Weg lief jede Zelle durch
   * `csvZelle`, also auch die Zahl — `"12"` mit Anfuehrungszeichen. Eine
   * Kalkulation liest das je nach Gebietsschema als Text, und die Spalte
   * „Vorschlag" liess sich dann nicht summieren; genau danach fragt man aber
   * eine Bestellliste.
   */
  it("legt Bestand, Mindestbestand und Vorschlag als Zahlen an", () => {
    const [, zeile] = blatt(BESTELL_BLATTNAME, BESTELL_SPALTEN, ZEILEN).daten;
    expect(zeile[1]).toEqual({ value: 3, type: Number });
    expect(zeile[2]).toEqual({ value: 10, type: Number });
    expect(zeile[3]).toEqual({ value: 7, type: Number });
  });

  /**
   * ⛔ DER KERN VON DRK-186. `csvTextZelle` setzte einem fuehrenden `=` einen
   * Apostroph voran, sonst fuehrte Excel die Zelle beim Oeffnen als Formel aus —
   * und der Apostroph war im Artikelnamen mitzulesen. In einer Mappe steht der
   * Name unveraendert und ist trotzdem keine Formel.
   */
  it("traegt einen Formelbeginn im Artikelnamen unveraendert, ohne Apostroph", () => {
    const [, , zeile] = blatt(BESTELL_BLATTNAME, BESTELL_SPALTEN, ZEILEN).daten;
    expect(zeile[0]).toEqual({ value: "=SUMME(A1)", type: String });
  });

  /** Anfuehrungszeichen im Namen brauchen keine Maskierung mehr — sie waren
   *  eine Eigenheit des CSV-Dialekts, nicht des Wertes. */
  it("laesst ein Anfuehrungszeichen im Namen unangetastet", () => {
    const zeilen = blatt(BESTELL_BLATTNAME, BESTELL_SPALTEN, ZEILEN).daten;
    expect(zeilen[3][0]).toEqual({ value: 'Handschuh "M"', type: String });
  });

  /**
   * ZEILENUMFANG: ALLE Zeilen, auch die bereits als bestellt markierten
   * (BestellListe.tsx — kein Filter). Die Zwischenablage nimmt nur die offenen;
   * die beiden Wege duerfen auseinanderlaufen und tun es (9-A).
   */
  it("nimmt auch die bereits bestellten Zeilen mit", () => {
    expect(blatt(BESTELL_BLATTNAME, BESTELL_SPALTEN, ZEILEN).daten).toHaveLength(1 + 3);
  });
});

describe("BESTELL_DATEINAME", () => {
  it("heisst bestellvorschlag.xlsx und traegt weiterhin kein Datum", () => {
    expect(BESTELL_DATEINAME).toBe("bestellvorschlag.xlsx");
    expect(BESTELL_DATEINAME).not.toMatch(/\d/);
  });
});

describe("Bauform", () => {
  /**
   * FALLE 6: `BESTELL_SPALTEN` ist ein WERT. Traegt die Datei `"use client"`,
   * bekommt jede Server Component, die sie liest, eine Client-Referenz statt der
   * Liste — HTTP 500 fuer die ganze Seite, `build` gruen, und Vitest kann es
   * strukturell nicht finden (dort ist die Direktive ein wirkungsloser String).
   */
  it("traegt kein use client", () => {
    // `ohneKommentare()` statt Rohtext-Scan — die Datei traegt den Satz
    // „kein \"use client\"" woertlich in ihrem eigenen Kopfkommentar und waere
    // sonst auf ihrer eigenen Begruendung rot.
    const quelle = readFileSync(join(__dirname, "bestellExport.ts"), "utf8");
    expect(ohneKommentare(quelle)).not.toMatch(/["']use client["']/);
  });
});

/**
 * Kopie von `ohneKommentare()` aus `_lib/bauform.test.ts` (K-4, Regel 1 der
 * Regeldatei fuer Teil 4). `bauform.test.ts` exportiert die Funktion nicht, und
 * diese Datei ist ein anderer Testkoerper — deshalb die lokale Kopie statt eines
 * Re-Exports.
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
