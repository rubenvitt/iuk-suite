import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { deckelText } from "./checksFilterLogik";

describe("deckelText", () => {
  it("nennt den Deckel nur, wenn mehr als die sichtbaren Treffer vorhanden sind", () => {
    expect(deckelText(50, true))
      .toBe("Neueste 50 von mehr Treffern — Zeitraum eingrenzen");
    expect(deckelText(50, false)).toBe("50 Treffer");
    expect(deckelText(3, false)).toBe("3 Treffer");
    expect(deckelText(1, false)).toBe("1 Treffer");
  });

  it("bleibt ein serverseitig ausführbarer Helfer ohne Client-Direktive", () => {
    const pfad = "src/app/m/lagerbuch/verwaltung/(arbeit)/checks/checksFilterLogik.ts";
    const quelle = readFileSync(pfad, "utf8");
    const source = ts.createSourceFile(
      pfad,
      quelle,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const direktiven = source.statements
      .filter(ts.isExpressionStatement)
      .map((anweisung) => anweisung.expression)
      .filter(ts.isStringLiteral)
      .map((ausdruck) => ausdruck.text);

    expect(direktiven).not.toContain("use client");
  });
});
