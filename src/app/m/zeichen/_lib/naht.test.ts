import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { posix } from "node:path";

import { describe, expect, it } from "vitest";

/*
 * DER RIEGEL. Ein Import von @einsatzzeichen im Server-Graph bricht `pnpm build`
 * (gemessen: catalog/dist/src/index.js:23 -> fonts.js `node:url`, Aufruf auf
 * Modulebene, ERR_INVALID_ARG_TYPE in der Phase „Collecting page data"). Der Fehler
 * kommt spaet und weit weg von seiner Ursache — dieser Test faengt ihn frueh.
 *
 * ⛔ DER SCAN GEHT UEBER src/ UND scripts/. Der Generator liegt AUSSERHALB von src/;
 * ein Scan nur ueber src/ saehe eine der beiden erlaubten Ausnahmen gar nicht und
 * behauptete faelschlich, es gebe nur eine.
 *
 * ⛔ REINE TYPIMPORTE ZAEHLEN NICHT. `import type { SymbolSpec }` verschwindet im
 * Build und zieht keinen Code; er kommt in mehr als zwei Dateien vor.
 *
 * ⚠️ WAS DIESER RIEGEL NICHT SIEHT: `git ls-files` listet nur GETRACKTE Dateien.
 * Eine neu angelegte, noch nicht vorgemerkte Datei mit Katalogimport laesst ihn gruen,
 * waehrend `pnpm build` — der aus dem Arbeitsbaum baut, nicht aus dem Index — bereits
 * bricht. Gemessen beim Aufbau dieser Datei: vor dem `git add` meldete der Scan eine
 * leere Liste, obwohl der Generator schon auf der Platte lag. Die Luecke schliesst
 * sich beim Commit, und die CI baut nur Getracktes — der Ausfall verschiebt sich also
 * nach hinten, er verschwindet nicht. Wer das enger haben will, laeuft wie
 * `core/shell/icons.test.ts` ueber das Dateisystem statt ueber den Index.
 */
const AUSNAHMEN = [
  // Laeuft in Node, nicht in Next — hier ist der Import unbedenklich.
  "scripts/zeichen-generat.ts",
  // Laedt ueber dynamic(..., { ssr: false }) und wird nie serverseitig ausgewertet.
  "src/app/m/zeichen/_ui/baukasten/paket.ts",
];

/**
 * Blockkommentare und Zeilenkommentare raus. Vorbild `core/shell/icons.test.ts`, und
 * aus demselben Grund: mehrere Dateien dieses Moduls SCHREIBEN ueber die Bedingung,
 * die hier geprueft wird — ein Scan ueber den Rohtext faellt ueber die eigene
 * Begruendung.
 */
function ohneKommentare(quelle: string): string {
  return quelle.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function dateienMitWertimport(): string[] {
  const roh = execFileSync("git", ["ls-files", "src", "scripts"], { encoding: "utf8" });
  return roh
    .split("\n")
    .filter((p) => /\.(ts|tsx|mts|js|jsx)$/.test(p))
    .filter((p) => !p.endsWith(".test.ts") && !p.endsWith(".test.tsx"))
    .filter((pfad) => {
      // Auch hier ohne Kommentare: mehrere Dateien dieses Moduls nennen
      // `@einsatzzeichen/...` in ihrer Begruendung, ohne es zu beziehen.
      const inhalt = ohneKommentare(readFileSync(pfad, "utf8"));
      /*
       * Fuenf Bezugsformen, und die reinen Typformen fallen heraus.
       *
       * ⚠️ DIE FUENFTE — `export … from` — IST KEINE VOLLSTAENDIGKEITSGESTE. Ohne sie
       * ist dieser Riegel wirkungslos, und zwar an der schlimmstmoeglichen Stelle:
       * `_ui/baukasten/paket.ts`, die eine der beiden erlaubten Ausnahmen, BEZIEHT den
       * Katalog ausschliesslich per Re-Export. Mit nur den vier Importformen findet der
       * Scan sie nicht, die Gleichheitszusicherung unten kann nie gruen werden — und
       * wer sie dann „repariert", indem er `paket.ts` aus AUSNAHMEN streicht, hat den
       * Riegel gegen genau die Bezugsform blind gemacht, die ein dritter Importeur am
       * bequemsten waehlt. Ein Re-Export zieht das Modul in den Graphen wie ein Import;
       * `pnpm build` unterscheidet die beiden nicht.
       *
       * `[^;]*` ueberspannt Zeilenumbrueche (eine negierte Zeichenklasse schliesst
       * `\n` ein) und deckt damit die mehrzeilige Klammerform mit ab; es endet am
       * ersten `;`, kann also nicht in die naechste Anweisung laufen.
       */
      const treffer = [
        /^\s*import\s+(?!type\b)[^;]*from\s+["']@einsatzzeichen\//m,
        /^\s*import\s+["']@einsatzzeichen\//m,
        /^\s*export\s+(?!type\b)[^;]*from\s+["']@einsatzzeichen\//m,
        /\bimport\(\s*["']@einsatzzeichen\//,
        /\brequire\(\s*["']@einsatzzeichen\//,
      ];
      return treffer.some((r) => r.test(inhalt));
    });
}

describe("Naht zu @einsatzzeichen", () => {
  it("wird nur in den zwei erlaubten Dateien als Wert importiert", () => {
    expect(dateienMitWertimport().sort()).toEqual([...AUSNAHMEN].sort());
  });

  /*
   * Die Zahl steht als eigene Zusicherung da, damit kein Dritter still in AUSNAHMEN
   * rutscht: wer die Liste erweitert, muss auch diese Zeile anfassen und im Commit
   * begruenden, warum ein dritter Importeur richtig ist.
   */
  it("erlaubt genau zwei Ausnahmen", () => {
    expect(AUSNAHMEN.length).toBe(2);
  });

  /*
   * ⚠️ KOMMENTARE ERST WEG, DANN PRUEFEN — und die Pruefung gilt EINEM Ausdruck.
   * Gemessen: ein blosses /ssr:\s*false/ ueber den Rohtext bleibt gruen, wenn man in
   * `BaukastenLader.tsx` auf `{ ssr: true }` umstellt, denn der einzige Treffer ist dann
   * der Kommentar „`ssr: false` IST DIE GEMESSENE BEDINGUNG" darueber. Ein Test, der
   * eine gemessene Build-Bedingung huetet und von seiner eigenen Begruendung erfuellt
   * wird, huetet nichts.
   *
   * `(?:(?!dynamic\()[\s\S])*?` heisst: zwischen `dynamic(` und `ssr: false` darf kein
   * zweites `dynamic(` liegen. Sonst genuegte irgendein `dynamic(` in der Datei plus
   * irgendwo spaeter ein `ssr: false` aus einem anderen Aufruf.
   */
  it("laedt den Baukasten mit ssr:false", () => {
    const lader = ohneKommentare(
      readFileSync("src/app/m/zeichen/_ui/baukasten/BaukastenLader.tsx", "utf8"),
    );
    expect(lader).toMatch(/dynamic\((?:(?!dynamic\()[\s\S])*?ssr:\s*false/);
    expect(lader).not.toMatch(/ssr:\s*true/);
  });

  /*
   * ⛔ DER RIEGEL GILT DER GANZEN KETTE, NICHT NUR IHREM ERSTEN GLIED.
   *
   * Der Scan oben sucht den Spezifizierer `@einsatzzeichen/…` und findet damit
   * genau EINE Datei: `paket.ts`. Den Katalog beziehen aber auch `zustand.ts`,
   * `vokabular.ts` und `BaukastenInsel.tsx` — ueber `./paket`. Wer eine dieser
   * drei anfasst, holt sich den Katalog, ohne dass der Scan oben etwas saehe.
   *
   * WAS DANN PASSIERT, IST GEMESSEN (03.09.2026, Next 16.3.3, mit Wegwerf-Route):
   *   - Eine SSR-GERENDERTE CLIENT-KOMPONENTE wertet die Kette in Node aus und
   *     stirbt beim Modulladen: `TypeError: The "path" argument must be of type
   *     string or an instance of URL. Received an instance of URL`
   *     (ERR_INVALID_ARG_TYPE) — HTTP 500 fuer die ganze Seite. Nur der Lader mit
   *     `dynamic(..., { ssr: false })` haelt das von der Serverseite fern.
   *   - `pnpm build` bleibt dabei GRUEN, solange die Route dynamisch ist: sie wird
   *     nie vorgerendert, der Ausfall faellt erst beim Abruf. Auf einer statischen
   *     Route zerlegte derselbe Import den Build.
   *   - Eine SERVER COMPONENT, die eine der drei Dateien importiert, laeuft
   *     dagegen durch: `"use client"` macht daraus eine Client-Referenz, das Modul
   *     wird serverseitig gar nicht ausgewertet. Harmlos ist es trotzdem nicht —
   *     es ist der erste Schritt dahin, dass jemand die Kette in eine
   *     SSR-gerenderte Flaeche zieht.
   * Deshalb gilt die Regel fuer die Kette als GANZE und nicht fuer einen
   * ausgewaehlten Kompositionsfall: die Unterscheidung „wird das hier
   * serverseitig ausgewertet?" ist genau die, die niemand im Kopf behaelt.
   *
   * Testdateien sind ausgenommen, wie oben: sie landen nie in einem Bundle.
   */
  const INSEL_ORDNER = "src/app/m/zeichen/_ui/baukasten";
  /** Die vier Module, die Katalog-Code ziehen — direkt oder ueber `./paket`. */
  const GESCHUETZT = ["paket", "zustand", "vokabular", "BaukastenInsel"];

  /** Das Ziel eines Spezifizierers als Repo-Pfad, oder `null` fuer ein Paket. */
  function zielPfad(datei: string, spezifizierer: string): string | null {
    if (spezifizierer.startsWith("."))
      return posix.normalize(posix.join(posix.dirname(datei), spezifizierer));
    if (spezifizierer.startsWith("@/"))
      return posix.normalize(posix.join("src", spezifizierer.slice(2)));
    return null;
  }

  function bezuegeAufDieInsel(): { datei: string; modul: string }[] {
    const roh = execFileSync("git", ["ls-files", "src", "scripts"], { encoding: "utf8" });
    const treffer: { datei: string; modul: string }[] = [];
    for (const datei of roh.split("\n")) {
      if (!/\.(ts|tsx|mts|js|jsx)$/.test(datei)) continue;
      if (datei.endsWith(".test.ts") || datei.endsWith(".test.tsx")) continue;
      const inhalt = ohneKommentare(readFileSync(datei, "utf8"));
      for (const m of inhalt.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) {
        const ziel = zielPfad(datei, m[1]);
        if (ziel === null || !ziel.startsWith(`${INSEL_ORDNER}/`)) continue;
        const modul = posix.basename(ziel).replace(/\.(ts|tsx|mts|js|jsx)$/, "");
        if (GESCHUETZT.includes(modul)) treffer.push({ datei, modul });
      }
    }
    return treffer;
  }

  it("laesst den Katalog nur INNERHALB von _ui/baukasten weiterreichen", () => {
    const draussen = bezuegeAufDieInsel()
      .filter((t) => posix.dirname(t.datei) !== INSEL_ORDNER)
      .map((t) => `${t.datei} -> ${t.modul}`);
    expect(
      draussen.sort(),
      "Diese Dateien ziehen Katalog-Code in ihren eigenen Graphen. Wird eine davon " +
        "serverseitig ausgewertet (SSR einer Client-Komponente), stirbt das Modulladen " +
        "mit ERR_INVALID_ARG_TYPE und die Seite antwortet mit 500 — gemessen, und weder " +
        "`pnpm build` noch Vitest sieht es. Der Weg fuehrt ueber BaukastenLader.tsx und " +
        "dynamic(..., { ssr: false }).",
    ).toEqual([]);
  });

  /*
   * Und INNERHALB des Ordners bleibt die Insel selbst dem Lader vorbehalten: ein
   * statischer Import von `BaukastenInsel` aus irgendeiner anderen Datei umginge
   * `dynamic(..., { ssr: false })` und damit die ganze Vorkehrung.
   */
  it("bindet BaukastenInsel ausschliesslich ueber den Lader ein", () => {
    const fremd = bezuegeAufDieInsel()
      .filter((t) => t.modul === "BaukastenInsel")
      .filter((t) => t.datei !== `${INSEL_ORDNER}/BaukastenLader.tsx`)
      .map((t) => t.datei);
    expect(fremd.sort(), "nur BaukastenLader.tsx darf die Insel kennen").toEqual([]);
  });
});
