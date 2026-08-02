// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import NotFound from "./not-found";

/**
 * DIE SUITEWEITE 404-SEITE.
 *
 * Zwei Zusagen, die beide STILL brechen — `pnpm build`, `typecheck` und `lint`
 * sehen keine davon:
 *
 * 1. DER DUNKELMODUS. Er haengt an `:root[data-theme="dark"]` (Cookie-
 *    Umschalter), nicht an `prefers-color-scheme`. Und weil die Seite ihre
 *    Farben ueber eigene Variablen fuehrt, genuegt eine vergessene Zeile im
 *    Dunkel-Block, damit ein Wert hell stehenbleibt: dunkler Text auf dunklem
 *    Grund, ohne Fehlermeldung. Deshalb wird PAARWEISE geprueft, nicht auf
 *    Anwesenheit eines Dunkel-Blocks.
 * 2. `--ant-*` IN EIGENEM MARKUP. antd deklariert seine Variablen auf der
 *    Scope-Klasse seiner eigenen Komponenten, nicht auf `:root` — hier waeren
 *    sie wirkungslos, und der Fehler ist, dass die Farbe einfach fehlt.
 *
 * Dazu der Text: der zweite Absatz ist kein Zierrat, sondern der Grund fuer
 * diese Aufgabe. Mehrere Riegel der Suite werfen absichtlich `notFound()` statt
 * eines 403; wer dort landet, muss erfahren, dass "gibt es nicht" hier auch
 * "darfst du nicht sehen" heissen kann.
 */

const quelle = (datei: string) => readFileSync(join(process.cwd(), "src/app", datei), "utf8");

/** Kommentare raus: die Begruendung DARF `--ant-*` nennen, der Code nicht. */
const ohneKommentare = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*$/gm, "");

const CSS = quelle("not-found.module.css");
const CSS_CODE = ohneKommentare(CSS);
const TSX_CODE = ohneKommentare(quelle("not-found.tsx"));

/** Die `--nf-*`-Namen, die ein Selektor-Block deklariert. */
function variablenIn(selektor: string): string[] {
  const start = CSS_CODE.indexOf(`${selektor} {`);
  expect(start, `Selektor fehlt: ${selektor}`).toBeGreaterThanOrEqual(0);
  const block = CSS_CODE.slice(start, CSS_CODE.indexOf("}", start));
  return [...block.matchAll(/(--nf-[a-z-]+)\s*:/g)].map((m) => m[1]).sort();
}

describe("404: die Seite sagt, was los ist", () => {
  const markup = renderToStaticMarkup(<NotFound />);

  it("nennt beide Faelle — nicht vorhanden UND nicht freigegeben", () => {
    expect(markup).toContain("Diese Seite gibt es hier nicht.");
    expect(markup).toMatch(/nicht freigegeben ist/);
  });

  it("bietet genau einen Weg zurueck, und der ist relativ", () => {
    // Relativ, damit der Host-Rewrite ihn traegt: auf einem Modul-Host fuehrt
    // `/` zum Modulanfang, auf dem Suite-Host ins Portal. Ein absoluter Link
    // koennte nur eines von beidem.
    const links = [...markup.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
    expect(links).toEqual(["/"]);
  });

  it("setzt keine Groesse am Knopf: controlHeight 56 ist bereits das Mass", () => {
    // `\ssize=` und nicht `size=`: sonst schlaegt die Zusicherung auch bei
    // `fontSize=` an und zeigt auf die falsche Regel.
    expect(TSX_CODE).not.toMatch(/\ssize=/);
  });
});

describe("404: beide Modi bleiben gepflegt", () => {
  it("jede Farbvariable des Hellmodus hat eine Entsprechung im Dunkelmodus", () => {
    const hell = variablenIn(".seite");
    const dunkel = variablenIn(':root[data-theme="dark"] .seite');

    expect(hell.length).toBeGreaterThan(0);
    expect(dunkel).toEqual(hell);
  });

  it("der Umschalter entscheidet, nicht das Betriebssystem", () => {
    expect(CSS_CODE).toContain(':root[data-theme="dark"]');
    expect(CSS_CODE).not.toContain("prefers-color-scheme");
  });

  it("die Seite setzt ihren eigenen Grund — es gibt hier keine antd-Layout-Flaeche", () => {
    // Ohne Shell traegt der `body` die Vorgabefarbe des Browsers. Faellt diese
    // Deklaration weg, steht die Karte im Dunkelmodus auf Weiss.
    expect(CSS_CODE).toMatch(/background:\s*var\(--nf-grund\)/);
    expect(CSS_CODE).toMatch(/min-height:\s*100dvh/);
  });

  it("eigenes Markup fasst `--ant-*` nicht an", () => {
    expect(CSS_CODE).not.toContain("--ant-");
    expect(TSX_CODE).not.toContain("--ant-");
  });
});
