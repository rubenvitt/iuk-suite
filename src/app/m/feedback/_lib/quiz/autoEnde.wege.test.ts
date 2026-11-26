import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * GENAU EIN AUTO-ENDE JE QUIZWEG, VOR DEM LESEN. `offeneRundePerCode` und `starteOderHoleRunde`
 * (`_db/quiz.ts`) holen das Auto-Ende nicht selbst nach — sonst liefe je SSE-Verbindung und POST
 * eine zweite Schreibtransaktion, und ihre Enden würden nicht gemeldet. Das tut der Aufrufer mit
 * `holeAutoEndeNach` (`_lib/quiz/stand.ts`). Diese Datei hält fest, dass jede Datei, die eine der
 * beiden aufruft, vorher `holeAutoEndeNach` aufruft.
 */
const WURZEL = "src/app/m/feedback";
const LESER = /\b(offeneRundePerCode|starteOderHoleRunde)\(/;

function quellen(verzeichnis: string, treffer: string[] = []): string[] {
  for (const eintrag of readdirSync(verzeichnis)) {
    const pfad = join(verzeichnis, eintrag);
    if (statSync(pfad).isDirectory()) quellen(pfad, treffer);
    else if (/\.tsx?$/.test(eintrag) && !/\.test\.tsx?$/.test(eintrag) && !pfad.endsWith(join("_db", "quiz.ts")))
      treffer.push(pfad);
  }
  return treffer;
}

/** Ohne Kommentare: ein Kommentar, der die Funktion nennt, ist kein Aufruf. */
function code(pfad: string): string {
  return readFileSync(pfad, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("Auto-Ende vor offeneRundePerCode/starteOderHoleRunde", () => {
  it("jeder Weg ruft vorher genau einmal holeAutoEndeNach", () => {
    const wege = quellen(WURZEL)
      .map((pfad) => ({ datei: relative(process.cwd(), pfad).split("\\").join("/"), text: code(pfad) }))
      .filter((q) => LESER.test(q.text));
    expect(wege.length).toBeGreaterThanOrEqual(6);
    for (const { datei, text } of wege) {
      const auto = text.indexOf("holeAutoEndeNach(");
      expect(auto, `${datei}: holeAutoEndeNach fehlt`).toBeGreaterThanOrEqual(0);
      expect(auto, `${datei}: holeAutoEndeNach steht nach dem Lesen`).toBeLessThan(text.search(LESER));
      expect(text.split("holeAutoEndeNach(").length - 1, `${datei}: mehr als ein Auto-Ende`).toBe(1);
    }
  });
});
