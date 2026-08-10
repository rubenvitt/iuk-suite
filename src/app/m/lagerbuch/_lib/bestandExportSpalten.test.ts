import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EXCEL_SPALTEN, EXCEL_BLATTNAME, EXCEL_FEHLERTEXT } from "./bestandExportSpalten";
import type { BestandExportZeile } from "./bestandExport";

const ZEILE: BestandExportZeile = {
  artikel: "Mullbinde 8cm", fach: "A2", bestand: 12, einheit: "Stk.",
  mindestbestand: 20, status: "unter Mindestbestand",
  charge: "L-42", verfall: "2026-08", hinweis: "faellig 08/26",
};

/**
 * Kopie von `ohneKommentare()` aus `_lib/bauform.test.ts` (K-4, Regel 1 der
 * Regeldatei fuer Teil 4), byte-identisch mit `_lib/pwaIcons.test.ts:19-39`.
 * `bestandExportSpalten.ts` traegt den Satz „use client" woertlich in seinem
 * eigenen Kopfkommentar (als Zitat der Falle) — ein Scan gegen den Rohtext
 * waere auf seiner eigenen Begruendung rot. `bauform.test.ts` exportiert die
 * Funktion nicht, deshalb die lokale Kopie statt eines Re-Exports.
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

describe("EXCEL_SPALTEN", () => {
  /** 1:1 aus ArtikelTable.tsx:89-99, Reihenfolge inbegriffen. */
  it("traegt neun Ueberschriften in dieser Reihenfolge", () => {
    expect(EXCEL_SPALTEN.map((s) => s.header)).toEqual([
      "Artikel", "Fach", "Bestand", "Einheit", "Mindestbestand",
      "Status", "Nächste Charge", "Verfall", "Hinweis",
    ]);
  });

  it("traegt die Breiten aus dem Bestand", () => {
    expect(EXCEL_SPALTEN.map((s) => s.width)).toEqual([34, 12, 10, 10, 16, 22, 18, 11, 20]);
  });

  /**
   * Zahlen bleiben Zahlen (Excel darf damit rechnen und sortieren), alles andere
   * ist Text. Genau die Spalten 3 und 5 — `Bestand` und `Mindestbestand`.
   */
  it("markiert genau Bestand und Mindestbestand als Zahl", () => {
    expect(EXCEL_SPALTEN.filter((s) => s.zahl).map((s) => s.header))
      .toEqual(["Bestand", "Mindestbestand"]);
  });

  it("liest jede Spalte aus dem passenden Feld", () => {
    expect(EXCEL_SPALTEN.map((s) => s.wert(ZEILE))).toEqual([
      "Mullbinde 8cm", "A2", 12, "Stk.", 20,
      "unter Mindestbestand", "L-42", "2026-08", "faellig 08/26",
    ]);
  });

  it("nennt Blattname und Fehlertext zeichengleich", () => {
    expect(EXCEL_BLATTNAME).toBe("Bestand Handlager");               // ArtikelTable.tsx:140
    expect(EXCEL_FEHLERTEXT)
      .toBe("Excel-Datei konnte nicht erzeugt werden – bitte erneut versuchen.");  // :144
    // Halbgeviertstrich U+2013, nicht Bindestrich — 1:1-Pflicht.
    expect(EXCEL_FEHLERTEXT).toContain("–");
  });

  /**
   * FALLE 6, und sie ist der ganze Grund fuer diese Datei: EXCEL_SPALTEN ist ein
   * WERT, der heute in einem "use client"-Modul lebt (ArtikelTable.tsx:89-99).
   * Aus einem Client-Modul erreicht ein Wert eine Server Component nur als
   * Referenz — HTTP 500 fuer die ganze Seite, waehrend typecheck und build gruen
   * bleiben und Vitest es strukturell nicht sehen kann. Der Scan laeuft ueber
   * `ohneKommentare()`, weil der Kopfkommentar der Datei den Ausdruck selbst
   * zitiert.
   */
  it("traegt kein use client und keinen Icon-Import", () => {
    const quelle = ohneKommentare(
      readFileSync(join(__dirname, "bestandExportSpalten.ts"), "utf8"),
    );
    expect(quelle).not.toMatch(/["']use client["']/);
    expect(quelle).not.toContain("@ant-design/icons");
    expect(quelle).not.toContain("lucide-react");
  });
});
