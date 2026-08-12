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
