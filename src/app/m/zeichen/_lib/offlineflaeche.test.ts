import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * QUELLTEXT-SCAN, kein DOM-Test — und er bewacht den EINEN Fehler, den kein
 * anderes Tor sieht: haengt jemand `/offline` in die `<Shell>`, traegt das HTML
 * `"userName"`, der Inhaltsriegel des Workers lehnt es zu Recht ab, und die PWA
 * cacht ab da GAR NICHTS mehr. `build`, `typecheck` und Vitest bleiben gruen,
 * die Seite sieht im Browser sogar besser aus, und der Ausfall zeigt sich erst
 * offline. Vorbild der Bauform: `core/shell/icons.test.ts`.
 */

const RAHMENLOS_LAYOUT = "src/app/m/zeichen/(rahmenlos)/layout.tsx";
const OFFLINE_SEITE = "src/app/m/zeichen/(rahmenlos)/offline/page.tsx";
const KATALOG_INSEL = "src/app/m/zeichen/_ui/KatalogInsel.tsx";

const lies = (pfad: string) => readFileSync(pfad, "utf8");

/** Kommentare weg, sonst schlaegt der Scan auf den BEGRUENDUNGEN an, die genau
 *  diese Namen nennen. */
function ohneKommentare(quelle: string): string {
  return quelle
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((zeile) => !zeile.trim().startsWith("//"))
    .join("\n");
}

describe("die rahmenlose Offline-Flaeche", () => {
  it.each([RAHMENLOS_LAYOUT, OFFLINE_SEITE])(
    "%s traegt weder Shell noch SuiteRahmen",
    (pfad) => {
      const quelle = ohneKommentare(lies(pfad));
      for (const verboten of ["SuiteRahmen", "FullShell", "MinimalShell", "<Shell"]) {
        expect(quelle, `${pfad}: ${verboten}`).not.toContain(verboten);
      }
    },
  );

  it.each([RAHMENLOS_LAYOUT, OFFLINE_SEITE])("%s ruft kein auth()", (pfad) => {
    // Gemessen (M17.3): jede Flaeche, die eine Sitzung liest, kann den Klarnamen
    // ins HTML tragen. Vorbild `uav /`: 45.944 B, mit UND ohne Sitzung
    // byteidentisch, 0x userName — genau diese Eigenschaft wird hier bewacht.
    const quelle = ohneKommentare(lies(pfad));
    expect(quelle).not.toContain("auth(");
    expect(quelle).not.toContain("canAdminModule");
  });

  it("das rahmenlose Layout legt dieselbe Bediendichte wie FullShell", () => {
    /*
     * Ohne `Arbeitsdichte` stuenden antd-Bedienelemente auf /offline auf 56/72
     * (der Einsatzwert aus `buildTheme`), waehrend das eigene Markup derselben
     * Insel seine 44 als LITERAL traegt — dieselbe Flaeche in zwei Groessen, und
     * kein Gate sieht es (Falle 5, still).
     */
    const quelle = ohneKommentare(lies(RAHMENLOS_LAYOUT));
    expect(quelle).toContain("Arbeitsdichte");
  });

  it("die Katalog-Insel kennt die Prop offline", () => {
    // Die Kopplung zwischen Aufgabe 6 und dieser Aufgabe. Faellt die Prop weg,
    // rendert /offline Merken-Knoepfe, die ohne Verbindung in einen Fehler
    // laufen — und das kostet an der Einsatzstelle genau die Zeit, um die es
    // geht (Spec §7.4).
    expect(ohneKommentare(lies(KATALOG_INSEL))).toContain("offline");
  });
});
