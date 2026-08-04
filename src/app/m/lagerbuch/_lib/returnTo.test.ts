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
});
