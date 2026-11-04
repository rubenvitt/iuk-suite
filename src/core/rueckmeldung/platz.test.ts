import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { ARBEITSDICHTE } from "@/core/theme/theme";
import { FUSSLEISTE, PLATZ } from "@/core/rueckmeldung/platz";

/**
 * DER PLATZ UNTER DEM SCHWEBENDEN KNOPF (IDA-352) — Quelltext-Zusicherungen,
 * weil jsdom weder Layoutboxen noch `:has()` rechnet. Die Lage im echten
 * Browser prüft `e2e/rueckmeldung.spec.ts` bei 320px.
 */
const CSS = readFileSync("src/core/rueckmeldung/rueckmeldung.module.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

describe("Platz unter dem Rückmeldeknopf", () => {
  it("ist so hoch wie der Knopf in der Arbeitsdichte plus sein Randabstand", () => {
    expect(ARBEITSDICHTE.token?.controlHeight).toBe(44);
    expect(CSS).toContain("--iuk-rueckmeldung-platz: calc(44px + max(16px, env(safe-area-inset-bottom)));");
    expect(CSS).toContain("inset-block-end: max(16px, env(safe-area-inset-bottom));");
  });

  it("fällt weg, solange eine Fußleiste klebt", () => {
    expect(FUSSLEISTE).toBe("data-fussleiste");
    expect(CSS).toMatch(/:global\(html\):has\(\[data-fussleiste\]\) \{\s*--iuk-rueckmeldung-platz: 0px;/);
    expect(CSS).toMatch(/:global\(html\):has\(\[data-fussleiste\]\) \.schweber \{\s*display: none;/);
  });

  it.each([
    ["die Abschlussleiste der Inventur", "src/app/m/lagerbuch/verwaltung/(arbeit)/inventur/Abschlussleiste.tsx"],
    ["die Verlaufsleiste im Kommunikationsplan", "src/app/m/kommplan/_ui/editor/Editor.tsx"],
  ])("%s ist als Fußleiste markiert", (_name, pfad) => {
    expect(readFileSync(pfad, "utf8")).toContain(`${FUSSLEISTE}=""`);
  });

  it("wird von der Vollhöhen-Tabelle abgezogen", () => {
    const quelle = readFileSync("src/core/tabelle/TabellenVollhoehe.tsx", "utf8");
    expect(quelle).toContain("rand: rand + platz");
    expect(PLATZ).toBe("rueckmeldung-platz");
  });
});
