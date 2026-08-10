import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ETIKETT_BREITE_MM, ETIKETT_HOEHE_MM, ETIKETT_QR_MM, ETIKETT_PADDING_MM,
  ETIKETT_SPALT_MM, BOGEN_GAP_BILDSCHIRM_MM, BOGEN_GAP_DRUCK_MM,
  SEITENRAND_MM, ETIKETT_ABGEWAEHLT_OPAZITAET, mm,
} from "./etikettMasse";

/**
 * 1:1-PFLICHT 22 (§8.4). Diese Zahlen sind auf GEKAUFTE Standard-Klebeetiketten
 * abgestimmt; jeder Fehlversuch verbraucht ein Blatt. Die Erwartungswerte stehen
 * hier als LITERALE und nicht als Import — sonst prueft der Test die Datei gegen
 * sich selbst und bleibt auch dann gruen, wenn jemand 48.5 in 48 aendert.
 */
describe("etikettMasse", () => {
  it("traegt die Geometrie aus globals.css:265-282 zeichengleich", () => {
    expect(ETIKETT_BREITE_MM).toBe(48.5);          // globals.css:265,266
    expect(ETIKETT_HOEHE_MM).toBe(25.4);           // :266
    expect(ETIKETT_QR_MM).toBe(20);                // :268
    expect(ETIKETT_PADDING_MM).toBe(2);            // :266
    expect(ETIKETT_SPALT_MM).toBe(2.5);            // :266
    expect(SEITENRAND_MM).toBe(8);                 // :276  @page{margin:8mm}
  });

  /**
   * DIE HEIKELSTE ZEILE DER TABELLE (§8.4): der Abstand ist am Bildschirm 2mm und
   * auf dem Papier 0. Wer nur die Bildschirmansicht portiert, uebernimmt das
   * falsche Raster und merkt es erst am Drucker.
   */
  it("unterscheidet den Abstand zwischen Bildschirm und Druck", () => {
    expect(BOGEN_GAP_BILDSCHIRM_MM).toBe(2);       // globals.css:265
    expect(BOGEN_GAP_DRUCK_MM).toBe(0);            // :279
    expect(BOGEN_GAP_BILDSCHIRM_MM).not.toBe(BOGEN_GAP_DRUCK_MM);
  });

  it("haelt die Abwahl am Bildschirm bei .35 — sichtbar, nicht weg", () => {
    expect(ETIKETT_ABGEWAEHLT_OPAZITAET).toBe(0.35); // globals.css:267
  });

  it("formatiert ohne nachlaufende Null", () => {
    expect(mm(48.5)).toBe("48.5mm");
    expect(mm(20)).toBe("20mm");
    expect(mm(0)).toBe("0mm");
  });

  /**
   * KEIN "use client" — Falle 6. Die Datei wird von einer Server Component
   * (druck.test.ts liest sie, page.tsx erbt sie ueber die Insel) UND von einer
   * Client-Insel gelesen. Mit "use client" bekaeme die Server-Seite eine
   * Client-Referenz statt des Wertes: HTTP 500, build gruen, Vitest blind.
   */
  it("traegt kein use client", () => {
    const quelle = readFileSync(join(__dirname, "etikettMasse.ts"), "utf8");
    expect(quelle).not.toMatch(/["']use client["']/);
  });
});
