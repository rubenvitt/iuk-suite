import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { einWert } from "./suchparameter";

/**
 * DRK-373, Codex-Befund P2 zu PR #186 — ein Suchparameter, der genau einen
 * Wert meint.
 */
describe("einWert — der gewöhnliche Fall", () => {
  it("gibt einen einzelnen Wert unverändert zurück", () => {
    expect(einWert("rtw-1")).toBe("rtw-1");
  });

  it("gibt für `undefined` auch `undefined`", () => {
    expect(einWert(undefined)).toBeUndefined();
  });

  /**
   * ⚠️ `?fz=` ERGIBT DIE LEERE ZEICHENKETTE, NICHT `undefined`. Als Id wäre sie
   * nie zu finden; die Seite behandelte „nichts angegeben" dann als „Id nicht
   * gefunden" — dieselbe Wirkung, aber aus dem falschen Grund, und der nächste
   * Leser sucht den Fehler in der Fahrzeugliste.
   */
  it("behandelt die leere Zeichenkette als KEINEN Wert", () => {
    expect(einWert("")).toBeUndefined();
    expect(einWert([""])).toBeUndefined();
  });
});

describe("einWert — das Array, das Next wirklich liefert", () => {
  /**
   * DER BEFUND. Nexts `searchParams` ist `string | string[] | undefined`,
   * unabhängig davon, was die Seite als Typ hinschreibt. Bei `?gescannt=b&
   * gescannt=b` verglich die Check-Seite ein Array mit einer Id, traf nie, und
   * der Hinweis verschwand STILL — der Ausgang, gegen den DRK-373 geschrieben
   * ist.
   */
  it("nimmt DENSELBEN Wert mehrfach als Wahl", () => {
    expect(einWert(["ktw-1", "ktw-1"])).toBe("ktw-1");
    expect(einWert(["ktw-1", "ktw-1", "ktw-1"])).toBe("ktw-1");
  });

  /**
   * ⚠️ ZWEI VERSCHIEDENE WERTE SIND KEINE WAHL, SONDERN EIN WIDERSPRUCH —
   * dieselbe Bedeutung wie `zaehlOrtAus` (DRK-337). Den ersten zu nehmen hieße,
   * sich still für eine von zwei Anweisungen zu entscheiden, und auf dem Schirm
   * stünde nichts, was sagt, welche.
   */
  it("verwirft zwei VERSCHIEDENE Werte", () => {
    expect(einWert(["ktw-1", "rtw-1"])).toBeUndefined();
  });

  it("verwirft ein leeres Array", () => {
    expect(einWert([])).toBeUndefined();
  });

  /** Ein einelementiges Array ist ein einzelner Wert. */
  it("löst ein einelementiges Array auf", () => {
    expect(einWert(["rtw-1"])).toBe("rtw-1");
  });

  /**
   * Gemischt aus leer und gefüllt: der leere Wert zählt nicht mit, der andere
   * bleibt eindeutig. `?fz=&fz=rtw-1` ist eine Wahl.
   */
  it("lässt einen leeren Wert neben einem gefüllten nicht stören", () => {
    expect(einWert(["", "rtw-1"])).toBe("rtw-1");
  });
});

describe("einWert — Bauform", () => {
  /**
   * ⚠️ DIE FUNKTION MUSS DIE GANZE FORM ENTGEGENNEHMEN, sonst ist sie
   * wirkungslos: eine Signatur `(roh: string | undefined)` würde von jeder
   * Aufrufstelle typkorrekt mit dem echten Laufzeitwert gefüttert, und das
   * Array käme unverändert durch. Genau diese Verengung war der Befund.
   */
  it("nimmt `string | string[] | undefined` an, nicht weniger", () => {
    const quelle = readFileSync("src/app/m/lagerbuch/_lib/suchparameter.ts", "utf8");
    expect(quelle).toMatch(/roh:\s*string\s*\|\s*string\[\]\s*\|\s*undefined/);
  });

  it("ist kein Client-Modul — Server Components lesen sie", () => {
    // Falle 6: ein WERT aus einem `"use client"`-Modul kommt in einer Server
    // Component als Client-Referenz an, HTTP 500 für die ganze Seite.
    const quelle = readFileSync("src/app/m/lagerbuch/_lib/suchparameter.ts", "utf8");
    expect(quelle).not.toMatch(/^\s*["']use client["']/m);
  });
});
