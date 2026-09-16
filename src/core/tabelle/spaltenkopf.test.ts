import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * DIESE DATEI BEWACHT EINE MESSUNG, KEINE VERMUTUNG (DRK-329, 2026-09-15,
 * echter Chromium gegen `next dev`, SSR-HTML und DOM nebeneinander gelesen).
 *
 * DER BEFUND: ein `columns[].title`, das als JSX-ELEMENT in einer SERVER
 * COMPONENT entsteht und von dort an antds `Table` gereicht wird, kommt im
 * Server-HTML in der Kopfzelle GAR NICHT AN. Gemessen an der Dateiliste der
 * Freigabe-Detailseite (`files`, `/shares/<id>`, vier Spalten, `scroll.x`
 * 1020), Stand `2c8e565`:
 *
 *   Server-HTML: <th class="ant-table-cell" scope="col"></th>   — VIERMAL leer
 *                die vier Titel stehen allein in `.ant-table-measure-row`
 *   nach der Hydration: die ERSTE Kopfzelle traegt ihren Text, die anderen
 *                drei bleiben leer — React repariert bis zur ersten Abweichung
 *                und verwirft den Rest des Teilbaums
 *   Konsole:     „Hydration failed because the server rendered HTML didn't
 *                match the client", mit `+ <span style={…}>` unter dem `<th>`
 *
 * DERSELBE TITEL ALS ZEICHENKETTE steht in beiden Stellen und meldet nichts —
 * das ist die Gegenprobe, einmal umgestellt und nachgemessen. Und derselbe
 * Titel als Element, aber IM CLIENT erzeugt (`mitKicker` in
 * `Datentabelle.tsx`), steht ebenfalls in beiden Stellen. Der Unterschied ist
 * also die RSC-Grenze, nicht die Elementform.
 *
 * WARUM ZWEI STELLEN: `@rc-component/table` rendert `columns[].title` doppelt —
 * einmal in die Kopfzelle und einmal in eine verborgene Messzeile, dort ueber
 * `React.cloneElement(rawTitle, { ref: null })`
 * (`@rc-component/table@1.11.1`, `es/Body/MeasureRow.js:36-40`). Der Klon
 * entsteht nur fuer ein Element; eine Zeichenkette geht unveraendert durch.
 *
 * ⚠️ DAS IST KEINE BLOSSE KONSOLENMELDUNG. Die Tabelle stand OHNE
 * SPALTENUEBERSCHRIFTEN auf dem Schirm — im Server-HTML vollstaendig, nach der
 * Hydration noch zu drei Vierteln. Wer nur die Meldung liest, haelt das fuer
 * eine Formalie.
 *
 * ⚠️ KEIN TOR SIEHT DAS, und darum steht hier ein QUELLTEXT-Scan statt eines
 * Verhaltenstests: `typecheck` kennt `ReactNode` als gueltigen `title`, `build`
 * serialisiert ihn klaglos, und Vitest kann die Wirkung STRUKTURELL nicht sehen
 * — unter jsdom gibt es keine RSC-Grenze, das Element ist dort ein gewoehnliches
 * Element und rendert in beiden Stellen. Dieselbe Lage wie bei den Fallen 6 und
 * 7; dort loest `core/shell/icons.test.ts` sie auf demselben Weg.
 *
 * BEHOBEN IST DIE STELLE SELBST SCHON: seit `97860eb` steht die Dateiliste in
 * der Client-Insel `files/_ui/ShareDateienTabelle.tsx` und uebergibt
 * `title: "Datei"` als Zeichenkette; den Kicker-`<span>` baut `Datentabelle`
 * im Client. Nachgemessen auf `main`: die Kopfzelle traegt ihren Text schon im
 * Server-HTML, und beide `files`-Specs laufen ohne eine einzige
 * Hydrationsmeldung. Dieser Riegel haelt nur fest, dass es so bleibt.
 *
 * ⚠️ WARUM DER SCAN UEBER DEN AST LAEUFT UND NICHT UEBER EINE REGEX. Der erste
 * Wurf tat das und war mit zwei Zeilen zu umgehen (im Review benannt):
 *
 *   const columns = [{ dataIndex: "a", title: <span>A</span> }];  // einzeilig
 *   { dataIndex: "a", title: kurz ? <span>A</span> : "A" }        // im Ternaer
 *
 * Beide erzeugen denselben Defekt und blieben gruen, weil die Regex `title:`
 * am Zeilenanfang erwartete und unmittelbar danach ein `<`. Ein Riegel, den
 * der Formatter oder ein Fragezeichen aushebelt, ist keiner — und die
 * Umgehungen faellt niemand absichtlich, sondern beim Umbrechen einer Zeile.
 * Der AST kennt weder Zeilenanfaenge noch Schreibweisen: er sucht ein
 * JSX-Element IRGENDWO im Wert der Eigenschaft.
 */

const WURZEL = "src";

/**
 * Geschwister-Schluessel, an denen ein Objekt als antd-SPALTE zu erkennen ist.
 *
 * ⚠️ DAS IST DIE EINGRENZUNG, UND SIE ERSETZT EINE SCHWAECHERE. Der erste Wurf
 * fragte, ob die DATEI irgendwo `columns` schreibt — das trifft die Absicht nur
 * ungefaehr (die Suite nennt ihre Spaltenlisten `spalten` und reicht sie als
 * `columns={spalten}` weiter) und ist ebenso leicht zu umgehen. Ein `title:`
 * neben `dataIndex`/`sorter`/`width` ist dagegen eine Spalte, und ein `title:`
 * in einem `Modal.confirm` oder einer eigenen Abschnittsliste ist es nicht.
 *
 * `key` steht BEWUSST NICHT hier: es ist der generischste Schluessel im ganzen
 * antd-Vorrat (`Steps`, `Tabs`, `Collapse` tragen ihn auch), und eine Spalte,
 * die AUSSER `key` und `title` nichts hat, gibt es in dieser Suite nicht.
 */
const SPALTEN_GESCHWISTER = new Set([
  "dataIndex",
  "render",
  "sorter",
  "width",
  "filters",
  "onFilter",
  "ellipsis",
  "fixed",
  "align",
  "colSpan",
  "responsive",
  "defaultSortOrder",
  "sortDirections",
  "onHeaderCell",
  "onCell",
]);

function traegtClientDirektive(quelle: ts.SourceFile): boolean {
  const erste = quelle.statements[0];
  if (!erste || !ts.isExpressionStatement(erste)) return false;
  return ts.isStringLiteral(erste.expression) && erste.expression.text === "use client";
}

function enthaeltJsx(knoten: ts.Node): boolean {
  if (
    ts.isJsxElement(knoten)
    || ts.isJsxSelfClosingElement(knoten)
    || ts.isJsxFragment(knoten)
  ) {
    return true;
  }
  return knoten.getChildren().some(enthaeltJsx);
}

function eigenschaftsName(eigenschaft: ts.ObjectLiteralElementLike): string | undefined {
  const name = eigenschaft.name;
  if (!name) return undefined;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  return undefined;
}

function istSpaltenObjekt(objekt: ts.ObjectLiteralExpression): boolean {
  return objekt.properties.some((eigenschaft) => {
    const name = eigenschaftsName(eigenschaft);
    return name !== undefined && SPALTEN_GESCHWISTER.has(name);
  });
}

/**
 * Die Zeilennummern aller `title`-Eigenschaften, deren Wert JSX enthaelt und
 * die in einem Objekt stehen, das sich als Spalte zu erkennen gibt.
 *
 * ⚠️ WAS DIESER SCAN NICHT SEHEN KANN, und das gehoert ausgeschrieben statt
 * verschwiegen: eine Kurzschreibweise (`{ title }`) und ein Titel, der als
 * VARIABLE hereinkommt (`title: kopf`), tragen das JSX nicht an dieser Stelle.
 * Das aufzuloesen hiesse, dem Wert durch die Datei zu folgen — dafuer braeuchte
 * es den Typchecker, nicht den Parser, und der Gewinn stuende nicht dafuer.
 * Was der Scan deckt, ist die Schreibweise, in der die Falle bisher entstanden
 * ist: das Element steht direkt am `title`.
 */
function jsxSpaltentitel(quelle: ts.SourceFile): number[] {
  const treffer: number[] = [];

  const besuche = (knoten: ts.Node): void => {
    if (ts.isObjectLiteralExpression(knoten) && istSpaltenObjekt(knoten)) {
      for (const eigenschaft of knoten.properties) {
        if (!ts.isPropertyAssignment(eigenschaft)) continue;
        if (eigenschaftsName(eigenschaft) !== "title") continue;
        if (!enthaeltJsx(eigenschaft.initializer)) continue;
        treffer.push(quelle.getLineAndCharacterOfPosition(eigenschaft.getStart()).line + 1);
      }
    }
    ts.forEachChild(knoten, besuche);
  };

  besuche(quelle);
  return treffer;
}

function lies(datei: string, text: string): ts.SourceFile {
  // `setParentNodes: true` ist Pflicht — ohne die Elternzeiger wirft
  // `getChildren()` in `enthaeltJsx` auf jedem Knoten ohne Quelltextbezug.
  return ts.createSourceFile(datei, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function sammleQuellen(verzeichnis: string, treffer: string[] = []): string[] {
  for (const eintrag of readdirSync(verzeichnis)) {
    const pfad = join(verzeichnis, eintrag);
    if (statSync(pfad).isDirectory()) {
      if (eintrag === ".next" || eintrag === "node_modules") continue;
      sammleQuellen(pfad, treffer);
      continue;
    }
    if (!/\.tsx$/.test(eintrag)) continue;
    if (/\.test\.tsx$/.test(eintrag)) continue; // Tests laufen nie in RSC.
    treffer.push(pfad);
  }
  return treffer;
}

describe("Spaltenueberschriften als JSX bleiben im Client", () => {
  it("jede Datei mit einem JSX-`columns[].title` traegt `use client`", () => {
    const suender: string[] = [];

    for (const datei of sammleQuellen(WURZEL)) {
      const quelle = lies(datei, readFileSync(datei, "utf8"));
      const zeilen = jsxSpaltentitel(quelle);
      if (zeilen.length === 0) continue;
      if (traegtClientDirektive(quelle)) continue;
      suender.push(`${datei}:${zeilen.join(",")}`);
    }

    expect(
      suender,
      "Diese Dateien bauen eine Spaltenueberschrift als JSX-Element OHNE `use "
        + "client`. Entsteht das Element in einer Server Component, rendert "
        + "@rc-component/table es nur in seine verborgene Messzeile und laesst die "
        + "Kopfzelle im Server-HTML LEER — Hydrationsfehler, und die Tabelle steht "
        + "ohne Spaltenueberschriften da (gemessen, DRK-329). Abhilfe: `title` als "
        + "ZEICHENKETTE uebergeben (`Datentabelle` baut den Kicker im Client), oder "
        + "die Spalten in eine Client-Insel heben.",
    ).toEqual([]);
  });

  /**
   * DIE GEGENPROBE ZUM SCAN SELBST: er muss ueberhaupt etwas sehen koennen.
   * Ohne sie bliebe der Riegel auch dann gruen, wenn die Suche ins Leere liefe
   * — und das faellt erst auf, wenn er gebraucht wird.
   *
   * DIE ERSTEN BEIDEN FAELLE SIND DIE, AN DENEN DER VORGAENGER SCHEITERTE (ein
   * einzeiliges Spaltenobjekt und ein Titel im Ternaer). Sie stehen hier, damit
   * niemand versehentlich auf eine zeilenbasierte Suche zurueckbaut.
   */
  it("der Scan erkennt jede Schreibweise und uebersieht, was keine ist", () => {
    const pruefe = (text: string) => jsxSpaltentitel(lies("probe.tsx", text)).length;

    expect(pruefe('const columns = [{ dataIndex: "a", title: <span>A</span> }];')).toBe(1);
    expect(pruefe('const columns = [{ dataIndex: "a", title: kurz ? <span>A</span> : "A" }];')).toBe(1);
    expect(pruefe('const columns = [{ width: 10, title: (\n  <>\n    <span>A</span>\n  </>\n) }];')).toBe(1);
    expect(pruefe('const spalten = [{ sorter: f, title: <Kopf /> }];')).toBe(1);

    // Zeichenketten sind der richtige Weg — und bleiben stumm.
    expect(pruefe('const columns = [{ dataIndex: "a", title: "A" }];')).toBe(0);
    // Ein Ternaer OHNE JSX ist kein Treffer (die alte Regex haette hier
    // beinahe falsch angeschlagen).
    expect(pruefe('const columns = [{ dataIndex: "a", title: kurz ? "A" : "B" }];')).toBe(0);
    // Kein Spaltenobjekt: `Modal.confirm`, Abschnittslisten, `Steps`.
    expect(pruefe('const abschnitte = [{ title: <span>A</span>, inhalt: x }];')).toBe(0);
    expect(pruefe('const schritte = [{ key: "a", title: <span>A</span> }];')).toBe(0);
  });

  it("erkennt die Client-Direktive nur, wenn sie wirklich die erste Anweisung ist", () => {
    expect(traegtClientDirektive(lies("a.tsx", '"use client";\nexport const a = 1;'))).toBe(true);
    // Ein Kopfkommentar davor ist erlaubt und aendert nichts.
    expect(traegtClientDirektive(lies("b.tsx", '// Kopf\n"use client";\nexport const a = 1;'))).toBe(true);
    // Eine Direktive HINTER einem Import ist keine — und waere still wirkungslos.
    expect(traegtClientDirektive(lies("c.tsx", 'import "x";\n"use client";'))).toBe(false);
    expect(traegtClientDirektive(lies("d.tsx", "export const a = 1;"))).toBe(false);
  });
});
