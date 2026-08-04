import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { ICONS } from "./icons";

/**
 * DIESE DATEI BEWACHT EINE MESSUNG, KEINE VERMUTUNG (2026-08-01, Naht B;
 * am selben Tag nachgebessert — die Ursachenangabe und drei „gemessen"-Saetze
 * hielten der Nachmessung nicht stand, siehe die Stellen unten und `icons.ts`).
 *
 * Gemessen mit einer Wegwerf-Route unter `next dev` (Next 16.2.6/Turbopack,
 * `@ant-design/icons` 6.3.2), jede Zeile per curl abgerufen:
 *
 *   Server Component, `import { ICONS } from "@/core/shell/icons"`,
 *   OHNE ein Icon zu rendern
 *     -> HTTP 500, `TypeError: (0 , _react.createContext) is not a function`,
 *        `at module evaluation (src/core/shell/icons.ts:1:1)`
 *
 * DER IMPORT WIRFT, NICHT DER RENDER. Beide Richtungen (die Map hier und ein
 * direktes `from "@ant-design/icons"`) fallen identisch aus, und beide fallen
 * schon, bevor irgendetwas gerendert wird — die Wert-Natur der Map rettet
 * nichts. Ursache steht im Kopfkommentar von `icons.ts` — kurz: nicht „der
 * Barrel" ist die Falle, sondern der NACKTE Spezifizierer, der in der RSC-Ebene
 * ueber `exports["."].node.import` in den CJS-Zweig `lib/` faellt.
 *
 * DIE IMPORTFORM IST DABEI EGAL — auch das gemessen (2026-08-01, gleiche
 * Sitzung, `@ant-design/icons/es` als 200er-Kontrolle daneben):
 *
 *   Server Component, `await import("@ant-design/icons")`
 *     -> HTTP 500, derselbe `createContext is not a function`
 *
 * Deshalb sammelt `importSpezifizierer` unten vier Importformen, nicht eine.
 *
 * WAS VITEST HIER NICHT KANN — und das ist eine Aussage, keine Ausrede:
 * Vitest kennt die RSC-Bedingung nicht. Es laedt `react` ueber die
 * `default`-Bedingung, dort IST `createContext` eine Funktion, die Icons
 * rendern klaglos, und `"use client"` ist ein wirkungsloser String. Ein
 * Verhaltenstest kann den Ausfall deshalb strukturell nicht sehen — genau wie
 * bei Falle 6. Was Vitest sehen kann, ist der QUELLTEXT: wer importiert, und
 * ob er die Client-Direktive traegt. Mehr ist hier nicht zu holen; den echten
 * 500 sieht nur ein echter Abruf.
 */

const WURZEL = "src";

/**
 * Der nackte Spezifizierer — und nur er. Ein Tiefen-Import
 * (`@ant-design/icons/FolderOutlined`) ist gemessen unbedenklich: HTTP 200, das
 * Icon steht im SSR-HTML. Warum, steht in `icons.ts`.
 */
const NACKTER_SPEZIFIZIERER = "@ant-design/icons";

function sammleQuellen(verzeichnis: string, treffer: string[] = []): string[] {
  for (const eintrag of readdirSync(verzeichnis)) {
    const pfad = join(verzeichnis, eintrag);
    if (statSync(pfad).isDirectory()) {
      // VORSORGLICH, UND HEUTE WIRKUNGSLOS: von `WURZEL = "src"` aus kann
      // dieser Zweig nicht greifen — `src/.next` und `src/node_modules`
      // existieren nicht, beide sind Geschwister von `src`. Hier stand bis zum
      // 2026-08-01 eine Begruendung, die ihn fuer wirksam ausgab; das war in
      // einer Datei, die eine Messung bewacht, genau der falsche Satz. Er
      // bleibt trotzdem stehen: er kostet nichts und haelt den Scan gutmuetig,
      // falls `WURZEL` je hoeher gelegt wird.
      if (eintrag === ".next" || eintrag === "node_modules") continue;
      sammleQuellen(pfad, treffer);
      continue;
    }
    if (!/\.tsx?$/.test(eintrag)) continue;
    if (/\.test\.tsx?$/.test(eintrag)) continue; // Tests laufen nie in RSC.
    treffer.push(pfad);
  }
  return treffer;
}

/**
 * OHNE KOMMENTARE: `icons.ts` und mehrere Seiten SCHREIBEN ueber diese Falle,
 * und ein Scan ueber den Rohtext fiele ueber die eigene Begruendung.
 *
 * WO DAS HEUTE TRAEGT — nachgemessen, weil die naheliegende Annahme falsch ist:
 * fuer den Import-Scan ist der Abzug derzeit WIRKUNGSLOS. Mit und ohne Abzug
 * meldet der Scan dieselben vier Dateien, und zwar auch mit der erweiterten
 * Regex unten (2026-08-01 ueber den ganzen Baum gefahren).
 *
 * DER GRUND IST NICHT DER NAHELIEGENDE, und der Vorgaenger-Satz hier hatte ihn
 * falsch („kein Kommentar im Baum enthaelt die Zeichenfolge `from
 * \"@ant-design/icons\"`"). Doch: die Kommentare von `icons.ts` tragen sowohl
 * `@ant-design/icons` als auch `@/core/shell/icons` — nur ueberspringt die
 * Schleife genau diese Datei ohnehin, und die vier echten Importeure tragen den
 * Spezifizierer im Code, nicht bloss in der Prosa. Faellt die Ausnahme fuer
 * `icons.ts` je weg, wird der Abzug sofort tragend.
 *
 * BEI `traegtClientDirektive` TRAEGT ER HEUTE EBENSO WENIG, und auch hier stand
 * das Gegenteil („wirksam bei `traegtClientDirektive`"). Zweistufig gemessen am
 * 2026-08-01:
 *
 *   (a) `ohneKommentare` dort ausgehebelt, Baum unveraendert    -> GRUEN
 *   (b) dieselbe Aushebelung + eine Wegwerf-Insel mit Kopfkommentar
 *       VOR der Direktive                                       -> ROT,
 *       die Insel wird faelschlich als Server Component gemeldet
 *
 * (a) heisst: keine Datei im Baum schreibt heute so, alle vier Importeure
 * setzen `use client` in Zeile 1. Der Abzug ist damit an BEIDEN Stellen
 * VORSORGE fuer eine erlaubte, aber unbenutzte Schreibweise — kein heute
 * tragender Riegel. Er bleibt trotzdem: (b) zeigt, dass ohne ihn eine korrekte
 * Client-Insel FALSCH-ROT gemeldet wuerde, und wer diesen Fehlalarm dann
 * abstellt, stellt erfahrungsgemaess den Riegel ab und nicht den Abzug.
 */
function ohneKommentare(quelle: string): string {
  return quelle.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function traegtClientDirektive(quelle: string): boolean {
  return /^\s*["']use client["']/.test(ohneKommentare(quelle));
}

/**
 * Alle Import-Spezifizierer einer Datei, Kommentare bereits entfernt.
 *
 * VIER FORMEN, NICHT EINE — und der Grund ist gemessen, nicht ausgedacht: bis
 * zum 2026-08-01 sah dieser Riegel nur `from "…"`. Drei Wegwerf-Importeure in
 * `src/core/shell` (`await import("@ant-design/icons")`, `import
 * "@ant-design/icons"`, `require("@ant-design/icons")`) liessen ihn GRUEN — und
 * der dynamische Importeur ist unter RSC derselbe HTTP 500 wie der statische
 * (oben gemessen). Der Test verspricht „jeder Importeur"; also muss er jeden
 * sehen. Gegenprobe nach der Erweiterung: eine Wegwerf-Datei mit
 * `await import("@ant-design/icons")` und ohne Direktive faerbt ihn rot und
 * wird namentlich genannt; ohne sie bleibt er gruen (keine Fehlalarme im Baum).
 *
 * `\b` vor jedem Schluesselwort ist Absicht: ohne es faengt `reimport("x")` mit
 * — nachgestellt, nicht vermutet.
 * Das optionale `\(` deckt die Aufrufformen, `\s*` die Umbrueche des Formatters.
 */
function importSpezifizierer(quelle: string): string[] {
  const muster = /(?:\bfrom|\bimport|\brequire)\s*\(?\s*["']([^"']+)["']/g;
  return [...ohneKommentare(quelle).matchAll(muster)].map((m) => m[1]);
}

function istClientNurQuelle(spezifizierer: string, datei: string): boolean {
  if (spezifizierer === NACKTER_SPEZIFIZIERER) return true;
  if (spezifizierer.endsWith("core/shell/icons")) return true;
  // Relativ, aber nur innerhalb von `core/shell` selbst.
  return spezifizierer === "./icons" && datei.startsWith(join("src", "core", "shell"));
}

describe("ICONS ist client-only — der Quelltext-Riegel", () => {
  it("jeder Importeur der Map oder des nackten antd-Icon-Spezifizierers traegt `use client`", () => {
    const suender: string[] = [];

    for (const datei of sammleQuellen(WURZEL)) {
      // Die Map selbst ist die Quelle, nicht ihr Verbraucher. Warum sie die
      // Direktive NICHT traegt, steht begruendet in `icons.ts` — mit `use
      // client` waere der Fehlgriff still statt laut (gemessen).
      if (datei === join("src", "core", "shell", "icons.ts")) continue;

      const quelle = readFileSync(datei, "utf8");
      const betroffen = importSpezifizierer(quelle).filter((s) => istClientNurQuelle(s, datei));
      if (betroffen.length === 0) continue;
      if (traegtClientDirektive(quelle)) continue;

      suender.push(`${datei} -> ${betroffen.join(", ")}`);
    }

    expect(
      suender,
      "Diese Dateien importieren antd-Icons OHNE `use client`. In einer Server " +
        "Component ergibt das HTTP 500 (`createContext is not a function`, schon " +
        "beim Import). Entweder die Datei wird eine Client-Insel, oder sie nimmt " +
        "eigenes Inline-SVG.",
    ).toEqual([]);
  });

  /**
   * DIE UMKEHRUNG, EBENFALLS GEMESSEN: `"use client"` auf `icons.ts` behebt den
   * 500 nicht, es macht ihn STILL. Mit der Direktive lieferte dieselbe
   * Wegwerf-Route HTTP 200 — und `Object.keys(ICONS).length` war **0**, weil
   * die Server Component eine Client-Referenz statt des Objekts bekommt (Falle
   * 6). Erst wer daraus rendert, sieht `Element type is invalid … but got:
   * undefined`. Laut ist besser als still: die Direktive bleibt weg.
   */
  it("`icons.ts` traegt selbst KEIN `use client` — sonst waere der Fehlgriff still", () => {
    const quelle = readFileSync(join("src", "core", "shell", "icons.ts"), "utf8");
    expect(traegtClientDirektive(quelle)).toBe(false);
  });

  it("die Map ist unter Vitest gefuellt — Beleg, dass der Riegel nicht am Import haengt", () => {
    // Nicht die Aussage der Datei, sondern ihre Gegenprobe: hier IST die Map
    // ein echtes Objekt. Genau deshalb kann kein Verhaltenstest den RSC-Ausfall
    // finden, und genau deshalb ist der Scan oben der einzige Riegel.
    expect(Object.keys(ICONS).length).toBeGreaterThan(0);
  });

  it("kennt ContainerOutlined fuer lagerbuch", () => {
    expect(Object.keys(ICONS)).toContain("ContainerOutlined");
  });
});
