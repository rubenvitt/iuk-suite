import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * JEDER `DatePicker` UND `TimePicker` DER SUITE TRAEGT `popupAlign={WAEHLER_IM_BILD}` (IDA-242, IDA-264).
 *
 * Ob das Fenster auf einem 375px-Telefon ueberragt, haengt an der Lage des Felds, und die sieht nur
 * ein echter Browser (`e2e/datumswaehler-schmal.spec.ts`, `e2e/monatswaehler-schmal.spec.ts`). Die
 * e2e-Messung deckt aber nur die Stellen, die sie oeffnet; ein neuer Waehler ohne `shiftX` fiele
 * erst auf, wenn jemand ihn auf dem Telefon aufklappt. Dieser Riegel faengt ihn beim Schreiben.
 */
const WURZEL = join(process.cwd(), "src");
const WAEHLER = new Set(["DatePicker", "TimePicker"]);

function tsxDateien(wurzel: string): string[] {
  const dateien: string[] = [];
  for (const eintrag of readdirSync(wurzel)) {
    const pfad = join(wurzel, eintrag);
    if (statSync(pfad).isDirectory()) dateien.push(...tsxDateien(pfad));
    else if (eintrag.endsWith(".tsx") && !eintrag.includes(".test.")) dateien.push(pfad);
  }
  return dateien.sort();
}

/** Jede `<DatePicker …>`- und `<TimePicker …>`-Stelle der Datei als `datei:zeile`, mit oder ohne den Riegel. */
function waehler(pfad: string): { ort: string; imBild: boolean }[] {
  const quelle = ts.createSourceFile(pfad, readFileSync(pfad, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const funde: { ort: string; imBild: boolean }[] = [];
  const besuche = (knoten: ts.Node): void => {
    if ((ts.isJsxOpeningElement(knoten) || ts.isJsxSelfClosingElement(knoten))
      && WAEHLER.has(knoten.tagName.getText(quelle))) {
      const imBild = knoten.attributes.properties.some((a) =>
        ts.isJsxAttribute(a)
        && a.name.getText(quelle) === "popupAlign"
        && a.initializer !== undefined
        && ts.isJsxExpression(a.initializer)
        && a.initializer.expression?.getText(quelle) === "WAEHLER_IM_BILD");
      const zeile = quelle.getLineAndCharacterOfPosition(knoten.getStart(quelle)).line + 1;
      funde.push({ ort: `${relative(WURZEL, pfad)}:${zeile}`, imBild });
    }
    ts.forEachChild(knoten, besuche);
  };
  besuche(quelle);
  return funde;
}

describe("Datums- und Zeitwähler bleiben in der Sichtfläche", () => {
  const alle = tsxDateien(WURZEL).flatMap(waehler);

  it("findet die Wähler überhaupt", () => {
    // Fünf Monatswähler aus IDA-242, sechzehn Tages- und Zeitwähler aus IDA-264.
    expect(alle.length).toBeGreaterThanOrEqual(21);
  });

  it("jeder trägt popupAlign={WAEHLER_IM_BILD}", () => {
    expect(alle.filter((w) => !w.imBild).map((w) => w.ort)).toEqual([]);
  });
});
