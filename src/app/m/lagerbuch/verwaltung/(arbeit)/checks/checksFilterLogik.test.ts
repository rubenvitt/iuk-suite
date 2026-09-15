import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { deckelText } from "./checksFilterLogik";

describe("deckelText", () => {
  const AMPEL = "Verfall- und Sauerstoff-Ampel sind gegen die heute geltenden Vorgaben gerechnet.";

  it("nennt den Deckel nur, wenn mehr als die sichtbaren Treffer vorhanden sind", () => {
    expect(deckelText(50, true))
      .toBe(`Neueste 50 von mehr Treffern — Zeitraum eingrenzen · ${AMPEL}`);
    expect(deckelText(50, false)).toBe(`50 Treffer · ${AMPEL}`);
    expect(deckelText(3, false)).toBe(`3 Treffer · ${AMPEL}`);
    expect(deckelText(1, false)).toBe(`1 Treffer · ${AMPEL}`);
  });

  it("⚠️ trägt den Ampel-Vorbehalt in BEIDEN Zweigen (DRK-308)", () => {
    // Die Chips dieser Liste („N Flasche(n) wechseln") sind gegen die HEUTE
    // geltende Vorgabe gerechnet, nicht gegen den Zeitpunkt des Checks. Der
    // Vorbehalt darf nicht am Deckel hängen: er gilt unabhängig davon, ob mehr
    // Treffer vorhanden sind, und eine gefilterte Liste ohne ihn läse sich als
    // Stand bei Abschluss.
    expect(deckelText(50, true)).toContain("heute geltenden Vorgaben");
    expect(deckelText(50, false)).toContain("heute geltenden Vorgaben");
    // Beide Ampeln benannt — eine von zwei aufzuzählen behauptet
    // Vollständigkeit und ist irreführender als gar kein Hinweis.
    expect(deckelText(3, false)).toContain("Sauerstoff-Ampel");
    expect(deckelText(3, false)).toContain("Verfall-");
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
