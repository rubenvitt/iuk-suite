import { describe, it, expect } from "vitest";
import { sanitizeReturnTo } from "./returnTo";

describe("sanitizeReturnTo — Open-Redirect-Schutz, 1:1 aus dem Bestand", () => {
  it("laesst lokale Pfade durch", () => {
    expect(sanitizeReturnTo("/verwaltung")).toBe("/verwaltung");
    expect(sanitizeReturnTo("/verwaltung/artikel?q=binde")).toBe("/verwaltung/artikel?q=binde");
    expect(sanitizeReturnTo("/a/abc123")).toBe("/a/abc123");
    expect(sanitizeReturnTo("/")).toBe("/");
  });

  it("weist alles ab, was nicht mit genau EINEM Schraegstrich beginnt", () => {
    expect(sanitizeReturnTo("verwaltung")).toBeNull();
    expect(sanitizeReturnTo("")).toBeNull();
    expect(sanitizeReturnTo(null)).toBeNull();
    expect(sanitizeReturnTo(undefined)).toBeNull();
  });

  it("weist protokoll-relative Ziele ab", () => {
    // `//boese.example` laedt der Browser als https://boese.example — der
    // klassische Open Redirect, der wie ein lokaler Pfad aussieht.
    expect(sanitizeReturnTo("//boese.example/verwaltung")).toBeNull();
  });

  it("weist `/\\` ab — Browser normalisieren es zu `//`", () => {
    // Die nicht offensichtliche Zeile. Ohne sie geht `/\boese.example` durch und
    // der Browser macht daraus `//boese.example`.
    expect(sanitizeReturnTo("/\\boese.example")).toBeNull();
  });

  it("weist jeden Doppelpunkt ab — eingeschmuggelte Schemata", () => {
    expect(sanitizeReturnTo("/x:foo")).toBeNull();
    expect(sanitizeReturnTo("https://boese.example")).toBeNull();
    expect(sanitizeReturnTo("javascript:alert(1)")).toBeNull();
  });

  it("weist einen Nicht-String ab, ohne zu werfen", () => {
    // `searchParams` liefert bei einem doppelt gesetzten Parameter ein Array.
    expect(sanitizeReturnTo(["/a", "/b"] as unknown as string)).toBeNull();
  });

  it("weist Tab, Zeilenvorschub und Wagenruecklauf ab — Haertung gegen WHATWG-Normalisierung", () => {
    // Die WHATWG-URL-Norm entfernt beim Parsen eines Location-Werts ALLE
    // ASCII-Tab-/Newline-Zeichen aus dem String, nicht nur am Rand:
    // new URL("/\t/boese.example", "https://lagerbuch.iuk-ue.de").href
    //   → "https://boese.example/"
    // Ohne diese Pruefung bestehen alle fuenf Bestandsablehnungen: kein
    // fehlender Slash, kein "//"-Praefix (das zweite Zeichen ist das
    // Steuerzeichen), kein "/\", kein Doppelpunkt — und das Ziel wird
    // trotzdem cross-origin.
    expect(sanitizeReturnTo("/\t/boese.example")).toBeNull();
    expect(sanitizeReturnTo("/\n/boese.example")).toBeNull();
    expect(sanitizeReturnTo("/\r/boese.example")).toBeNull();
  });

  it("laesst einen gueltigen Pfad unveraendert durch — die Haertung bricht keinen legitimen Ruecksprung", () => {
    expect(sanitizeReturnTo("/verwaltung/artikel?q=binde")).toBe("/verwaltung/artikel?q=binde");
  });
});
