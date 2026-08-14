import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * DIE DRUCKREGELN DER FAHRZEUG-CHECKLISTE (`lb-cl-*` in `(druck)/druck.css`).
 *
 * ⚠️ WAS DIESER SCAN HAELT UND WAS NICHT — dieselbe Grenze wie in
 * `etiketten/druck.test.ts`: er belegt „die Regel steht da", NIE „sie wirkt".
 * `pnpm build` und Vitest sehen `@media print` gar nicht, Playwright rendert
 * per Vorgabe fuer den Bildschirm, und jsdom rechnet keine Seitenumbrueche. Die
 * WIRKUNG belegt ein Abruf mit `page.emulateMedia({ media: "print" })`, das
 * Papier belegt ein Probedruck.
 *
 * ⚠️ VIER ZUSICHERUNGEN STEHEN HIER AUSDRUECKLICH NICHT, WEIL SIE STRIKT
 * SCHWAECHERE DUPLIKATE WAEREN — `etiketten/druck.test.ts` haelt sie bereits
 * fuer die GANZE Datei und teils fuer den ganzen Modulbaum: kein `--ant-`, kein
 * `.ant-`, kein nackter `input`-Selektor, und nirgends `body *` oder
 * `visibility: hidden`. Eine Kopie hier koennte nie ausloesen, ohne dass es
 * dort schon rot waere (Praezedenzfall fuers Streichen einer solchen Kopie:
 * der vierte Review-Fund in `etiketten/druck.test.ts`).
 */

const DRUCK_CSS = join(__dirname, "..", "druck.css");
const css = () => readFileSync(DRUCK_CSS, "utf8");

/** Kopie von `ohneKommentare()` aus `_lib/bauform.test.ts` — die Funktion wird
 *  dort nicht exportiert, und dieser Testkoerper soll eigenstaendig sein
 *  (dieselbe Begruendung wie in `etiketten/druck.test.ts`). */
function ohneKommentare(quelle: string): string {
  let imBlock = false;
  return quelle
    .split("\n")
    .map((zeile) => {
      if (imBlock) {
        const zu = zeile.indexOf("*/");
        if (zu === -1) return "";
        imBlock = false;
        return " ".repeat(zu + 2) + zeile.slice(zu + 2);
      }
      const auf = zeile.indexOf("/*");
      if (auf !== -1 && !zeile.slice(0, auf).includes("*/")) {
        const zu = zeile.indexOf("*/", auf + 2);
        if (zu === -1) { imBlock = true; return zeile.slice(0, auf); }
        return zeile.slice(0, auf) + " ".repeat(zu + 2 - auf) + zeile.slice(zu + 2);
      }
      return zeile.trimStart().startsWith("//") ? "" : zeile;
    })
    .join("\n");
}

/** Dieselbe Zweiteilung wie in `etiketten/druck.test.ts`: alles vor dem ersten
 *  `@media` ist Bildschirm, der `@media print`-Block ist Papier. */
function teile(): { bildschirm: string; druck: string } {
  const rein = ohneKommentare(css());
  const block = /@media\s+print\s*\{([\s\S]*)\n\}/.exec(rein);
  expect(block, "kein @media print-Block").not.toBeNull();
  return { bildschirm: rein.slice(0, rein.indexOf("@media")), druck: block![1]! };
}

function regel(quelle: string, selektor: string): string {
  const muster = new RegExp(
    `${selektor.replace(/[.+*]/g, (z) => `\\${z}`)}\\s*\\{([^}]*)\\}`,
  );
  const treffer = muster.exec(quelle);
  expect(treffer, `keine Regel auf ${selektor}`).not.toBeNull();
  return treffer![1]!;
}

describe("die Checkliste steht im richtigen Teil der Datei", () => {
  /**
   * DIE STRUKTURELLE ZUSICHERUNG, OHNE DIE DIE HALBE TESTDATEI NEBENAN STILL
   * DAS FALSCHE PRUEFT. `etiketten/druck.test.ts` schneidet die Datei an
   * `indexOf("@media")` in „Bildschirm" und „Druck". Wandern die `lb-cl-`
   * Bildschirmregeln HINTER den `@media print`-Block, landen sie im
   * Druck-Abschnitt jener Tests — und die Etiketten-Zusicherungen ueber den
   * Bildschirmteil pruefen dann einen Text, in dem ihre Regeln gar nicht mehr
   * stehen koennen.
   */
  it("Bildschirmregeln vor `@media print`, Druckregeln darin", () => {
    const { bildschirm, druck } = teile();
    expect(bildschirm).toContain(".lb-cl-blatt");
    expect(druck).toContain(".lb-cl-blatt");
  });

  /** Es bleibt bei EINEM `@media print` in dieser Datei — die Zusicherung
   *  „genau eine Datei mit @media print" nebenan zaehlt Dateien, nicht Bloecke,
   *  und saehe einen zweiten Block nicht. */
  it("hat genau einen `@media print`-Block", () => {
    const treffer = ohneKommentare(css()).match(/@media\s+print\s*\{/g) ?? [];
    expect(treffer).toHaveLength(1);
  });
});

describe("das Blatt auf Papier", () => {
  /**
   * ⚠️ DIE LOAD-BEARING ZEILE. Am Bildschirm ist `.lb-cl-blatt` auf 210mm
   * gekappt — eine A4-Attrappe, damit vor dem Druck sichtbar ist, was auf eine
   * Seite passt. 210mm IST die volle Blattbreite; bliebe die Kappung im Druck
   * stehen, waere die Bahn zusammen mit `@page { margin: 8mm }` um 16mm
   * breiter als der Satzspiegel, und Chrome skalierte still auf rund 92 %
   * herunter. Jede Schriftgroesse dieses Stylesheets stimmte dann nicht mehr —
   * sichtbar ausschliesslich in der Druckvorschau.
   */
  it("hebt die A4-Attrappe im Druck auf", () => {
    const { bildschirm, druck } = teile();
    expect(regel(bildschirm, ".lb-cl-blatt")).toMatch(/max-width:\s*210mm/);
    expect(regel(druck, ".lb-cl-blatt")).toMatch(/max-width:\s*none/);
  });

  /**
   * JEDES FAHRZEUG BEGINNT AUF EINEM NEUEN BLATT — ueber `break-before` am
   * ZWEITEN und jedem weiteren, NICHT ueber `break-after` an allen.
   *
   * ⚠️ DER NEGATIVE TEIL IST DER EIGENTLICHE FUND. `break-after: page` am
   * letzten Blatt wirft eine LEERE Schlussseite aus. Bei zehn Fahrzeugen faellt
   * das niemandem auf; beim Druck EINER Checkliste ist die Haelfte des
   * Ausdrucks leer — und niemand druckt zum Pruefen zehn Blaetter.
   */
  it("bricht VOR jedem weiteren Blatt um, nie NACH einem", () => {
    const { druck } = teile();
    const geschwister = regel(druck, ".lb-cl-blatt + .lb-cl-blatt");
    expect(geschwister).toMatch(/break-before:\s*page/);
    // Der Alias fuer aeltere Druckmaschinen geht mit — er kostet nichts und
    // rettet die Trennung dort, wo `break-before` noch nicht greift.
    expect(geschwister).toMatch(/page-break-before:\s*always/);
    expect(druck, "break-after: page wirft eine leere Schlussseite aus")
      .not.toMatch(/\.lb-cl-[^{]*\{[^}]*break-after:\s*page/);
  });
});

describe("die Tabelle ueberlebt den Seitenumbruch", () => {
  /**
   * `table-header-group` WIEDERHOLT DIE KOPFZEILE AUF JEDER FOLGESEITE. Ohne
   * sie steht ab Seite zwei eine Spalte mit der Zahl „20" ohne Ueberschrift da,
   * und niemand weiss mehr, ob das Soll oder Ist ist. Der Browser tut das fuer
   * `thead` von Haus aus — aber nur, solange niemand `display` daran anfasst.
   */
  it("wiederholt die Tabellenkopfzeile", () => {
    expect(regel(teile().bildschirm, ".lb-cl-tabelle thead"))
      .toMatch(/display:\s*table-header-group/);
  });

  /** Eine Zeile, die ueber den Seitenrand bricht, ist auf einer Abhakliste ein
   *  echter Fehler: das Kaestchen landet auf Seite 1, der Artikelname auf
   *  Seite 2. */
  it("haelt jede Zeile zusammen", () => {
    const koerper = regel(teile().bildschirm, ".lb-cl-tabelle tr");
    expect(koerper).toMatch(/break-inside:\s*avoid/);
    expect(koerper).toMatch(/page-break-inside:\s*avoid/);
  });

  /** Eine Ueberschrift am Seitenfuss, deren Tabelle erst auf der Folgeseite
   *  beginnt, ist der klassische Druckfehler dieser Sorte Blatt. */
  it("laesst Abschnitts- und Fachueberschrift nicht allein am Seitenfuss stehen", () => {
    const { bildschirm } = teile();
    for (const selektor of [".lb-cl-abschnitt", ".lb-cl-fach"]) {
      expect(regel(bildschirm, selektor), selektor).toMatch(/break-after:\s*avoid/);
      expect(regel(bildschirm, selektor), selektor).toMatch(/page-break-after:\s*avoid/);
    }
  });
});

describe("ein Blatt Papier hat keinen Dunkelmodus", () => {
  /**
   * DIE WERTE SIND LITERALE, KEIN `var(--lb-…)`. Das `(druck)`-Layout haengt
   * unter `.modul`, und dessen `--lb-*`-Satz KIPPT im Dunkelzweig
   * (`_ui/verwaltung.module.css`). Ein `var(--lb-tinte)` hier druckte aus einer
   * dunkel eingestellten Sitzung helle Schrift auf weisses Papier — und
   * `print-color-adjust: exact` verbietet dem Browser jede Notrechnung.
   */
  it("nagelt Blatt und Bogen auf #ffffff und #000000", () => {
    const { bildschirm } = teile();
    for (const selektor of [".lb-cl-bogen", ".lb-cl-blatt"]) {
      expect(regel(bildschirm, selektor), selektor).toMatch(/background:\s*#ffffff/);
      expect(regel(bildschirm, selektor), selektor).toMatch(/color:\s*#000000/);
    }
  });

  it("benutzt in keiner `lb-cl-`-Regel eine `--lb-`-Farbe", () => {
    // `--font-*` bleibt erlaubt: die Schriftstapel sind zonen- und
    // themenunabhaengig und stehen ausserhalb des `.modul`-Farbsatzes.
    const rein = ohneKommentare(css());
    const verstoesse = [...rein.matchAll(/\.lb-cl-[^{]*\{([^}]*)\}/g)]
      .map((t) => t[1]!)
      .filter((koerper) => /var\(--lb-/.test(koerper));
    expect(verstoesse).toEqual([]);
  });
});
