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
 *    Umschalter), nicht an `prefers-color-scheme`. Die Seite faerbt sich
 *    deshalb NUR aus `--iuk-*`, deren Dunkelzweig `globals.css` pflegt — eine
 *    eigene Farbe ohne Dunkelzweig waere still hell.
 * 2. `--ant-*` IN EIGENEM MARKUP. antd deklariert seine Variablen auf der
 *    Scope-Klasse seiner eigenen Komponenten, nicht auf `:root` — hier waeren
 *    sie wirkungslos, und der Fehler ist, dass die Farbe einfach fehlt.
 *
 * Dazu der Text: kein Erklaertext, nur der Satz. Er bleibt neutral ("hier"),
 * weil mehrere Riegel absichtlich `notFound()` statt eines 403 werfen.
 */

const quelle = (datei: string) => readFileSync(join(process.cwd(), "src/app", datei), "utf8");

/** Kommentare raus: die Begruendung DARF `--ant-*` nennen, der Code nicht. */
const ohneKommentare = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*$/gm, "");

const CSS = quelle("not-found.module.css");
const CSS_CODE = ohneKommentare(CSS);
const TSX_CODE = ohneKommentare(quelle("not-found.tsx"));

describe("404: die Seite sagt, was los ist", () => {
  const markup = renderToStaticMarkup(<NotFound />);

  it("ist ein Ruhezustand mit der Figur fuer \u201enicht gefunden\u201c und dem Satz als Ueberschrift", () => {
    expect(markup).toContain('data-figur="query"');
    expect(markup).toMatch(/<h1[^>]*>Diese Seite gibt es hier nicht\.<\/h1>/);
  });

  it("sagt nur, was los ist — ohne Erklaertext", () => {
    expect(markup).toContain("Diese Seite gibt es hier nicht.");
    expect(markup).not.toMatch(/nicht freigegeben ist/);
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
  it("faerbt sich nur aus den Suite-Tokens, deren Dunkelzweig `globals.css` traegt", () => {
    const farben = [...CSS_CODE.matchAll(/(?:color|background):\s*([^;]+);/g)].map((m) => m[1].trim());
    expect(farben.length).toBeGreaterThan(0);
    for (const farbe of farben) expect(farbe).toMatch(/^var\(--iuk-[a-z-]+\)$/);
  });

  it("der Umschalter entscheidet, nicht das Betriebssystem", () => {
    expect(CSS_CODE).not.toContain("prefers-color-scheme");
  });

  it("die Seite setzt ihren eigenen Grund — es gibt hier keine antd-Layout-Flaeche", () => {
    // Ohne Shell traegt der `body` die Vorgabefarbe des Browsers. Faellt diese
    // Deklaration weg, steht die Figur im Dunkelmodus auf Weiss.
    expect(CSS_CODE).toMatch(/background:\s*var\(--iuk-grund\)/);
    expect(CSS_CODE).toMatch(/min-height:\s*100dvh/);
  });

  it("eigenes Markup fasst `--ant-*` nicht an", () => {
    expect(CSS_CODE).not.toContain("--ant-");
    expect(TSX_CODE).not.toContain("--ant-");
  });
});
