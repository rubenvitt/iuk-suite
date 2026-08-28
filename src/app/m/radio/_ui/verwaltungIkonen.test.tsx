// @vitest-environment jsdom
// src/app/m/radio/_ui/verwaltungIkonen.test.tsx
import { describe, it, expect, afterEach } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { mount, unmount, queryAll } from "@/app/m/qr/_lib/test-dom";
import { VIkone, ZEICHEN, type VerwaltungsIkonName } from "./verwaltungIkonen";

const QUELLE = "src/app/m/radio/_ui/verwaltungIkonen.tsx";
/** Die Flaechen, auf denen die Zeichen sitzen — der Verwaltungszweig. */
const VERWALTUNG = "src/app/m/radio/admin";

/**
 * Die Namen zur LAUFZEIT. ⛔ Aus `ZEICHEN` abgeleitet und nicht als zweite Liste
 * geschrieben: die Union ist die Autoritaet, und eine handgepflegte Kopie hier waere
 * genau der stille Auseinanderlauf, gegen den die Union steht.
 */
const NAMEN = Object.keys(ZEICHEN) as VerwaltungsIkonName[];

/** Jede ausgelieferte Quelldatei unter einem Verzeichnis — Testdateien ausgenommen. */
function quellDateien(wurzel: string, treffer: string[] = []): string[] {
  for (const eintrag of readdirSync(wurzel)) {
    const pfad = join(wurzel, eintrag);
    if (statSync(pfad).isDirectory()) {
      quellDateien(pfad, treffer);
      continue;
    }
    if (!/\.tsx?$/.test(eintrag)) continue;
    if (/\.(?:test|spec)\.tsx?$/.test(eintrag)) continue;
    treffer.push(pfad);
  }
  return treffer;
}

function quelltextBaum(dateiname: string, quelle: string): ts.SourceFile {
  return ts.createSourceFile(
    dateiname,
    quelle,
    ts.ScriptTarget.Latest,
    true,
    dateiname.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

/**
 * Jeder LITERAL gesetzte `name` an einem `<VIkone>` einer Datei.
 *
 * ⛔ UEBER DIE COMPILER-API, NICHT UEBER EINE TEXTREGEX (Hausform,
 * `lagerbuch/_ui/ikonen.test.ts:36-46`): ein Regex unterscheidet Kommentar nicht von Code
 * und kennt die gueltigen JSX-Formen nicht. Der Importalias wird mitgelesen, damit ein
 * `import { VIkone as Z }` den Scan nicht umgeht.
 *
 * ⚠️ WAS ER NICHT SIEHT — und das ist benannt, nicht verschwiegen: einen dynamisch
 * berechneten Namen. Der bleibt TypeScripts Aufgabe, weil `name` den Uniontyp traegt.
 */
function literaleNamen(dateiname: string, quelle: string): string[] {
  const source = quelltextBaum(dateiname, quelle);
  const tags = new Set<string>();
  const treffer: string[] = [];

  function sammle(node: ts.Node) {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      /verwaltungIkonen$/.test(node.moduleSpecifier.text) &&
      node.importClause?.namedBindings &&
      ts.isNamedImports(node.importClause.namedBindings)
    ) {
      for (const element of node.importClause.namedBindings.elements) {
        if ((element.propertyName ?? element.name).text === "VIkone") tags.add(element.name.text);
      }
    }
    ts.forEachChild(node, sammle);
  }
  sammle(source);

  function besuche(node: ts.Node) {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      ts.isIdentifier(node.tagName) &&
      tags.has(node.tagName.text)
    ) {
      const attribut = node.attributes.properties.find(
        (p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText(source) === "name",
      );
      const wert = attribut?.initializer;
      if (wert && ts.isStringLiteral(wert)) treffer.push(wert.text);
      else if (
        wert &&
        ts.isJsxExpression(wert) &&
        wert.expression &&
        ts.isStringLiteral(wert.expression)
      ) {
        treffer.push(wert.expression.text);
      }
    }
    ts.forEachChild(node, besuche);
  }
  besuche(source);
  return treffer;
}

afterEach(async () => {
  await unmount();
});

describe("verwaltungIkonen: die Bauform der Zeichenquelle", () => {
  it("importiert ausschliesslich react-icons und traegt kein use client", () => {
    /*
     * ⛔ ZWEI ZUSICHERUNGEN IN EINEM FALL, weil sie dieselbe Datei tragen.
     *
     * Die Importliste: genau die zwei erlaubten Quellen, nichts sonst — kein antd, kein
     * CSS-Modul, nichts aus dem Modul selbst (das machte die Datei zyklisch importierbar).
     * ⛔ SIE IST ZUGLEICH DIE GEGENSICHERUNG ZUR SCAN-AUSNAHME in
     * `_ui/AusleihRahmen.test.tsx`: diese Datei ist dort vom `size=`-Scan (Falle 4)
     * ausgenommen, weil `react-icons` sein Mass ueber `size` nimmt. Die Ausnahme waere ein
     * Loch, wenn hier je ein antd-Bedienelement entstuende — es kann keines entstehen,
     * solange diese Liste steht.
     *
     * ⛔ DAS "use client"-VERBOT ist die wichtigste Zeile: die Datei exportiert einen WERT
     * (`ZEICHEN`) und einen TYP, und die Verwaltungsflaechen sind teils Server Components.
     * Eine Direktive hier macht aus Falle 7 die Falle 6 — HTTP 200 mit leerer Map und still
     * falschem Bild, und Vitest kann das strukturell nicht sehen.
     */
    const source = quelltextBaum("verwaltungIkonen.tsx", readFileSync(QUELLE, "utf8"));
    const spezifizierer = source.statements
      .filter(ts.isImportDeclaration)
      .map((s) => (ts.isStringLiteral(s.moduleSpecifier) ? s.moduleSpecifier.text : ""));
    expect([...spezifizierer].sort()).toEqual(["react-icons/lib", "react-icons/pi"]);
    expect(source.statements.filter(ts.isImportEqualsDeclaration).length).toBe(0);
    expect(
      source.statements.some(
        (s) =>
          ts.isExpressionStatement(s) &&
          ts.isStringLiteral(s.expression) &&
          s.expression.text === "use client",
      ),
    ).toBe(false);
  });

  it("jeder literal benutzte Name unter admin/ steht in der Union", () => {
    /*
     * ⚠️ HEUTE LEER UND DESHALB MIT UNTERGRENZE. Task 1 legt die Quelle an, aber noch keine
     * Aufrufstelle — ohne die erste Zusicherung waere dieser Fall leer-gruen und laese sich
     * wie eine Deckung, die er noch nicht hat. Die Untergrenze belegt wenigstens, dass der
     * Walker den Verwaltungsbaum wirklich liest; die Namenspruefung traegt ab der Aufgabe,
     * die die Zeichen setzt.
     */
    const dateien = quellDateien(VERWALTUNG);
    expect(dateien.length, "der Walker liest den Verwaltungsbaum nicht").toBeGreaterThan(10);
    const unbekannt = dateien.flatMap((pfad) =>
      literaleNamen(relative(process.cwd(), pfad), readFileSync(pfad, "utf8"))
        .filter((name) => !(name in ZEICHEN))
        .map((name) => `${relative(process.cwd(), pfad)}: ${JSON.stringify(name)}`),
    );
    expect(unbekannt, "ein Zeichenname ohne Eintrag in der Union").toEqual([]);
  });
});

describe("verwaltungIkonen: die Union ist die Autoritaet", () => {
  it("fuehrt genau zwanzig Zeichen, doppelfrei", () => {
    // Zwanzig — die achtzehn Zeichen der Alt-Anwendung plus `pfeil-links` und `lupe`, die
    // dort keine eigenen Zeichen waren, hier aber Knoepfe mit klarer Semantik tragen.
    expect(NAMEN.length).toBe(20);
    expect(new Set(Object.values(ZEICHEN)).size, "ein Zeichen ist doppelt vergeben").toBe(20);
  });

  it("bildet jeden Namen auf eine Komponente ab", () => {
    for (const name of NAMEN) expect(typeof ZEICHEN[name], name).toBe("function");
  });

  it("jeder Name rendert ein eigenes SVG mit mindestens einer Zeichenanweisung", async () => {
    // Ohne die zweite Zusicherung waere ein leerer Eintrag („<svg/>") vollzaehlig UND gruen.
    await mount(
      <>
        {NAMEN.map((name) => (
          <VIkone key={name} name={name} />
        ))}
      </>,
    );
    const svgs = queryAll("svg");
    expect(svgs.length).toBe(NAMEN.length);
    for (const [i, svg] of svgs.entries()) {
      expect(svg.getAttribute("data-zeichen")).toBe(NAMEN[i]);
      expect(svg.children.length, `${NAMEN[i]}: leeres SVG`).toBeGreaterThan(0);
    }
  });

  it("jedes Zeichen ist dekorativ — aria-hidden und nicht fokussierbar", async () => {
    /*
     * Jedes Zeichen dieser Flaechen steht neben der Beschriftung seines Knopfes. Ein Zeichen
     * ohne `aria-hidden` liesse eine Bildschirmleserin dieselbe Aktion zweimal hoeren;
     * `focusable="false"` haelt das `<svg>` aus der Tabulatorkette des Trident-Zweigs.
     */
    await mount(
      <>
        {NAMEN.map((name) => (
          <VIkone key={name} name={name} />
        ))}
      </>,
    );
    for (const svg of queryAll("svg")) {
      expect(svg.getAttribute("aria-hidden"), svg.getAttribute("data-zeichen") ?? "?").toBe("true");
      expect(svg.getAttribute("focusable")).toBe("false");
    }
  });

  it("die Groesse ist ein Prop, wirkt auf Breite UND Hoehe, und misst vorgabeweise 16", async () => {
    // 16 statt lagerbuchs 18: die Verwaltung laeuft auf SCHREIBTISCHDICHTE (32/40).
    await mount(<VIkone name={NAMEN[0]!} />);
    expect(queryAll("svg")[0]!.getAttribute("width")).toBe("16");
    await unmount();
    await mount(<VIkone name={NAMEN[0]!} groesse={31} />);
    const svg = queryAll("svg")[0]!;
    expect(svg.getAttribute("width")).toBe("31");
    expect(svg.getAttribute("height")).toBe("31");
  });
});
