import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * WER SCHREIBT DIENSTABENDE? — der Riegel im Code, weil es keinen in der
 * Datenbank gibt (DRK-479).
 *
 * „Höchstens ein Dienstabend je Gruppe und Kalendertag" (DRK-429) prüfen die
 * schreibenden Wege selbst (`abendAmTag` in `queries.ts`). Einen `UNIQUE`-Index
 * gibt es mit Absicht nicht; die Begründung steht dort. Der Preis: ein NEUER
 * Weg, der `evenings` beschreibt, umginge die Regel still, und kein anderer
 * Test merkte es — das Formular sähe gut aus, und am Ende stünden zwei
 * getrennte Auswertungen für einen Abend.
 *
 * Diese Datei zählt deshalb jede Stelle, die in `evenings` einfügt oder dort
 * ändert, und vergleicht mit der Liste unten. Wer hier rot wird, hat einen
 * neuen Schreibweg gebaut: prüfen, ob er die Tagesregel einhält (in derselben
 * Transaktion wie das Schreiben), und ihn DANN in die Liste aufnehmen.
 *
 * Gelesen wird der Syntaxbaum, nicht der Rohtext: `queries.ts` und `actions.ts`
 * SCHREIBEN in Kommentaren über `insertEvening`, und ein Textscan fiele über
 * die eigene Begründung.
 */

const WURZELN = ["src", "scripts"];

/**
 * `Datei › Funktion › Art`. Die Art sagt, wie geschrieben wird:
 * `insert`/`update` über Drizzle, `insertEvening` über die ungeprüfte
 * Einfügefunktion, `sql` als Rohtext.
 */
const ERLAUBT = [
  // Die geprüften Wege: jeder fragt `abendAmTag` bzw. die belegten Tage ab.
  "src/app/m/feedback/_db/queries.ts › createAndStartSurvey › insert",
  "src/app/m/feedback/_db/queries.ts › planEvenings › insert",
  "src/app/m/feedback/_db/queries.ts › trageAbendNach › insert",
  "src/app/m/feedback/_db/queries.ts › updateEvening › update",
  // Ändern kein Datum: sie setzen Lage, Thema, Notizen, Teilnehmerzahl.
  "src/app/m/feedback/_db/queries.ts › createAndStartSurvey › update",
  "src/app/m/feedback/_db/queries.ts › gibAbendFrei › update",
  "src/app/m/feedback/_db/queries.ts › setEveningStatus › update",
  // Die ungeprüfte Einfügefunktion und wer sie benutzt. Beides legt Bestand
  // an, der Import zusätzlich den Altbestand, der Doppeltage tragen darf —
  // er meldet sie nach dem Lauf (`berichtDoppelteTage`).
  "src/app/m/feedback/_db/queries.ts › insertEvening › insert",
  "src/app/m/feedback/_lib/seed.ts › seedGroup › insertEvening",
  // Zweimal: gelaufene Abende und Termine.
  "src/app/m/feedback/_lib/seedLokal.ts › seedGruppe › insertEvening",
  "src/app/m/feedback/_lib/seedLokal.ts › seedGruppe › insertEvening",
  "scripts/import/feedback.ts › importFeedback › insert",
].sort();

function quellen(verzeichnis: string, treffer: string[] = []): string[] {
  for (const eintrag of readdirSync(verzeichnis)) {
    const pfad = join(verzeichnis, eintrag);
    if (statSync(pfad).isDirectory()) {
      if (eintrag === "node_modules" || eintrag === ".next" || eintrag === "fixtures") continue;
      quellen(pfad, treffer);
    } else if (/\.tsx?$/.test(eintrag) && !/\.test\.tsx?$/.test(eintrag)) {
      treffer.push(pfad);
    }
  }
  return treffer;
}

function umschliessendeFunktion(node: ts.Node): string {
  for (let n = node.parent; n; n = n.parent) {
    if (ts.isFunctionDeclaration(n) && n.name) return n.name.text;
  }
  return "(Modulebene)";
}

function schreibstellen(pfad: string): string[] {
  const text = readFileSync(pfad, "utf8");
  // Billiger Vorfilter: eine Datei ohne das Wort kann keine Stelle haben.
  if (!/evenings|insertEvening/i.test(text)) return [];
  const quelle = ts.createSourceFile(pfad, text, ts.ScriptTarget.Latest, true);
  const datei = relative(process.cwd(), pfad).split("\\").join("/");
  const stellen: string[] = [];
  const melde = (node: ts.Node, art: string) =>
    stellen.push(`${datei} › ${umschliessendeFunktion(node)} › ${art}`);

  const besuche = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const ziel = node.expression;
      const name = ts.isPropertyAccessExpression(ziel)
        ? ziel.name.text
        : ts.isIdentifier(ziel)
          ? ziel.text
          : null;
      const erstes = node.arguments[0];
      if (
        (name === "insert" || name === "update") &&
        erstes &&
        /(^|\.)evenings$/.test(erstes.getText(quelle))
      ) {
        melde(node, name);
      }
      if (name === "insertEvening") melde(node, "insertEvening");
    }
    if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node)) &&
      /\b(INSERT\s+(OR\s+\w+\s+)?INTO|UPDATE)\s+["`]?evenings\b/i.test(node.text)
    ) {
      melde(node, "sql");
    }
    ts.forEachChild(node, besuche);
  };
  besuche(quelle);
  return stellen;
}

describe("Schreibwege in `evenings` (DRK-479)", () => {
  it("jeder Weg, der Dienstabende anlegt oder ändert, steht auf der Liste", () => {
    const gefunden = WURZELN.flatMap((w) => quellen(w)).flatMap(schreibstellen).sort();
    expect(gefunden).toEqual(ERLAUBT);
  });
});
