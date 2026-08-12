import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * DIE DREI SCHRIFT-ROLLENVARIABLEN DER SUITE.
 *
 * Sie waren einmal ein toter Vertrag: `app/m/lagerbuch/_ui/helfer.module.css`
 * loeste `--lb-display` gegen `var(--font-display)` auf, und die Variable stand
 * NIRGENDS. Der Helfer-Weg rendete in "Arial Narrow" — dem Fallback. Der
 * Ausfall war still: eine unaufgeloeste Variable protokolliert nichts, und
 * `pnpm build` sieht sie nicht.
 *
 * DIESER SCAN PRUEFT BEIDE HAELFTEN, UND DAS IST DER PUNKT. Eine Pruefung auf
 * `globals.css` allein ginge durch, wenn jemand die Schrift aus `layout.tsx`
 * entfernt: dann stuende `var(--font-barlow-condensed)` ins Leere und der
 * Fallback waere zurueck — derselbe stille Ausfall, eine Ebene tiefer.
 *
 * WAS ER NICHT KANN: belegen, dass die Schrift wirklich GERENDERT wird. Ein
 * fehlgeschlagener Font-Fallback ist im Quelltext von einer erfolgreichen
 * Zuweisung nicht zu unterscheiden. Diese Aussage besitzt
 * `e2e/lagerbuch-helfer.spec.ts` (`getComputedStyle(...).fontFamily`).
 */
const GLOBALS = readFileSync("src/app/globals.css", "utf8");
const LAYOUT = readFileSync("src/app/layout.tsx", "utf8");

/** Kommentare raus — eine Erwaehnung im Fliesstext ist keine Deklaration. */
const css = GLOBALS.replace(/\/\*[\s\S]*?\*\//g, "");

describe("Schriftstapel — die drei Rollenvariablen", () => {
  it("deklariert --font-display, --font-body und --font-mono auf :root", () => {
    for (const name of ["--font-display", "--font-body", "--font-mono"]) {
      expect(css, `${name} wird in globals.css nicht deklariert`)
        .toMatch(new RegExp(`${name}\\s*:`));
    }
  });

  it("zieht --font-display aus einer Familie, die layout.tsx auch registriert", () => {
    // Der Name aus der Deklaration wird HERAUSGELESEN, nicht als Literal
    // wiederholt: ein Test, der "--font-barlow-condensed" fest verdrahtet,
    // muesste beim Schriftwechsel mitgeaendert werden und wuerde dabei leicht
    // auf die alte Familie stehen bleiben.
    const treffer = css.match(/--font-display\s*:\s*var\(\s*(--[\w-]+)/);
    expect(treffer, "--font-display zieht nicht aus einer var()").not.toBeNull();
    const quelle = treffer![1]!;
    expect(LAYOUT, `layout.tsx registriert ${quelle} nicht`)
      .toMatch(new RegExp(`variable:\\s*"${quelle}"`));
  });

  it("haengt jede in layout.tsx registrierte Schriftvariable an <html>", () => {
    // Eine registrierte Familie, deren `.variable` nicht in der className des
    // <html> landet, ist geladen und unerreichbar — wieder still.
    const registriert = [...LAYOUT.matchAll(/const\s+(\w+)\s*=\s*\w+\(\{[^}]*variable:/g)]
      .map((t) => t[1]!);
    expect(registriert.length, "keine einzige Schrift registriert — der Scan waere leer-gruen")
      .toBeGreaterThanOrEqual(3);
    for (const bezeichner of registriert) {
      expect(LAYOUT, `${bezeichner}.variable fehlt in der className von <html>`)
        .toMatch(new RegExp(`\\$\\{${bezeichner}\\.variable\\}`));
    }
  });
});

describe("Suite-Farbvariablen fuer eigenes Markup", () => {
  const IUK = ["--iuk-marke", "--iuk-gedaempft", "--iuk-linie"];

  it("deklariert jede --iuk-* auf :root", () => {
    // Auf den HELLEN `:root`-Block verankert, nicht auf die ganze Datei: eine
    // Suche ueber den gesamten Text waere schon zufrieden, wenn die Variable
    // NUR im Dunkelzweig steht — genau die Luecke, die Falle (b) unten
    // eigentlich abdecken soll, aber nicht abdeckt, wenn hier nicht verankert
    // wird. `:root\s*\{` matcht `:root[data-theme="dark"] {` nicht (das
    // Attribut steht dazwischen), und `--iuk-` im Block schliesst den
    // Schrift-`:root`-Block aus.
    const hell = css.match(/:root\s*\{([^}]*--iuk-[^}]*)\}/);
    expect(hell, "kein --iuk-Block auf dem hellen :root").not.toBeNull();
    for (const name of IUK) {
      expect(hell![1]!, `${name} fehlt auf :root`).toMatch(new RegExp(`${name}\\s*:`));
    }
  });

  it("gibt jeder --iuk-* einen Dunkelzweig", () => {
    // Das alte Lagerbuch, dessen Palette hier einzieht, HATTE keinen
    // Dunkelmodus. Jede portierte Farbe braucht ein Gegenstueck, sonst steht
    // sie im Dunkelmodus auf einem Wert, den niemand geprueft hat.
    const dunkel = css.match(/:root\[data-theme="dark"\]\s*\{([^}]*)\}/);
    expect(dunkel, "kein Dunkelzweig in globals.css").not.toBeNull();
    for (const name of IUK) {
      expect(dunkel![1]!, `${name} fehlt im Dunkelzweig`)
        .toMatch(new RegExp(`${name}\\s*:`));
    }
  });

  it("schaltet ueber data-theme, nicht ueber prefers-color-scheme", () => {
    // `prefers-color-scheme` braeche den Fall „System dunkel, Umschalter hell".
    expect(css).not.toMatch(/prefers-color-scheme/);
  });

  it("gibt jeder --iuk-* im Dunkeln einen ANDEREN Wert als im Hellen", () => {
    // Die beiden Tests oben pruefen nur, DASS ein Name mit Doppelpunkt
    // auftaucht — nicht, welcher Wert dahinter steht. Ein vertauschter oder
    // versehentlich kopierter Wert (Hellwert im Dunkelzweig, Dunkelwert im
    // Hellzweig, oder schlicht zweimal derselbe Wert) waere fuer beide Tests
    // unsichtbar, obwohl genau DAS die Frage ist, die der Dunkelzweig
    // beantworten soll. Deshalb: Wert je Variable extrahieren und auf
    // Ungleichheit pruefen — der Hex-Code selbst wird bewusst NICHT
    // festgenagelt, nur dass er sich vom jeweils anderen Zweig unterscheidet.
    const hell = css.match(/:root\s*\{([^}]*--iuk-[^}]*)\}/);
    const dunkel = css.match(/:root\[data-theme="dark"\]\s*\{([^}]*)\}/);
    expect(hell, "kein --iuk-Block auf dem hellen :root").not.toBeNull();
    expect(dunkel, "kein Dunkelzweig in globals.css").not.toBeNull();

    for (const name of IUK) {
      const hellTreffer = hell![1]!.match(new RegExp(`${name}\\s*:\\s*([^;]+);`));
      const dunkelTreffer = dunkel![1]!.match(new RegExp(`${name}\\s*:\\s*([^;]+);`));
      expect(hellTreffer, `${name}: kein auswertbarer Wert im Hellen`).not.toBeNull();
      expect(dunkelTreffer, `${name}: kein auswertbarer Wert im Dunkeln`).not.toBeNull();

      const hellWert = hellTreffer![1]!.trim();
      const dunkelWert = dunkelTreffer![1]!.trim();
      expect(
        dunkelWert,
        `${name}: Dunkelwert (${dunkelWert}) ist identisch zum Hellwert — ` +
          `vertauscht oder kopiert?`,
      ).not.toBe(hellWert);
    }
  });
});
