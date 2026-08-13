import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Gemeinsamer Datei-Scan-Helfer fuer die Test-Riegel des Moduls `aufgaben` —
 * vorher zeichengleich dupliziert in `ikonen.test.tsx` (dort `alleDateien`)
 * und `SeitenKopf.test.tsx` (dort `alleQuellDateien`): dieselbe Rekursion,
 * dieselbe `.tsx?`/`.test.tsx?`-Filterung, dieselbe Kommentar-Regex.
 * Zusammengefuehrt INNERHALB des Moduls, weil beide Nutzniesser hier liegen —
 * der Massstab, den `docs/design/README.md` fuer eine Extraktion verlangt
 * (ein zweiter, HEUTE belegbarer Nutzer), ist damit erfuellt.
 *
 * BEWUSST NICHT nach `src/core` gehoben, obwohl `core/shell/icons.test.ts`
 * denselben Helfer ein drittes Mal traegt (dort `sammleQuellen`): ein Umzug
 * dorthin zoege jenen Test in denselben Umbau, und er bewacht eine gemessene
 * Falle (Falle 7, halbe Arbeitstage Messaufwand), keine Stilfrage. Wer ihn
 * anfasst, tut das als eigene Aufgabe mit eigener Begruendung — hier nur
 * vermerkt, damit die Frage als gesehen und vertagt gilt, nicht als
 * uebersehen.
 */
export function alleQuellDateien(verzeichnis: string, treffer: string[] = []): string[] {
  for (const eintrag of readdirSync(verzeichnis)) {
    const pfad = join(verzeichnis, eintrag);
    if (statSync(pfad).isDirectory()) {
      alleQuellDateien(pfad, treffer);
      continue;
    }
    if (!/\.tsx?$/.test(eintrag)) continue;
    if (/\.test\.tsx?$/.test(eintrag)) continue; // Tests schreiben UEBER die Verbote/Regeln.
    treffer.push(pfad);
  }
  return treffer;
}

export function ohneKommentare(quelle: string): string {
  return quelle.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}
