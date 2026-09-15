import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
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
 */

const WURZEL = "src";

/**
 * OHNE KOMMENTARE — sonst faellt der Scan ueber die eigene Begruendung: dieser
 * Kopf schreibt `title: <span …>` aus, und mehrere Kommentare im Baum tun es
 * ebenfalls.
 */
function ohneKommentare(quelle: string): string {
  return quelle.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function traegtClientDirektive(quelle: string): boolean {
  return /^\s*["']use client["']/.test(ohneKommentare(quelle));
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

/**
 * Ein `title:` als Objektschluessel, dessen Wert mit JSX beginnt — `<` direkt
 * am Schluessel oder hinter der Klammer, die der Formatter setzt, sobald das
 * Element umbricht (`title: (\n  <span …`).
 *
 * ⚠️ DIE KLAMMER ALLEIN GENUEGT NICHT ALS TREFFER. `title: (a ? b : c)` ist
 * kein JSX; wer das meldet, meldet eine Stelle, ueber die diese Datei nichts
 * gemessen hat. Deshalb muss hinter der Klammer ein `<` stehen.
 *
 * ⚠️ NUR IN EINER DATEI, DIE AUCH `columns` KENNT. Ein `title:` gibt es auch
 * anderswo (`Modal.confirm`, eigene Abschnittslisten); die Messung oben gilt
 * aber allein der doppelt gerenderten Spaltenueberschrift. Ohne diese
 * Einschraenkung meldete der Riegel Stellen, ueber die er nichts weiss — und
 * ein Riegel, der auch falsch anschlaegt, wird abgeschaltet statt befolgt.
 */
function jsxSpaltentitel(quelle: string): boolean {
  const text = ohneKommentare(quelle);
  if (!/\bcolumns\b/.test(text)) return false;
  return /^\s*title:\s*(?:<|\(\s*<)/m.test(text);
}

describe("Spaltenueberschriften als JSX bleiben im Client", () => {
  it("jede Datei mit einem JSX-`columns[].title` traegt `use client`", () => {
    const suender = sammleQuellen(WURZEL).filter((datei) => {
      const quelle = readFileSync(datei, "utf8");
      return jsxSpaltentitel(quelle) && !traegtClientDirektive(quelle);
    });

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
   * Ohne sie bliebe der Riegel auch dann gruen, wenn die Regex ins Leere liefe
   * — und das faellt erst auf, wenn er gebraucht wird.
   */
  it("der Scan erkennt beide Schreibweisen und uebersieht, was keine ist", () => {
    // Umgebrochen wie der Formatter es schreibt — ein einzeiliges Beispiel
    // pruefte eine Form, die im Baum gar nicht vorkommt.
    const einzeilig = ["const columns = [", "  {", "    title: <span>A</span>,", "  },", "];"].join("\n");
    const geklammert = ["const columns = [", "  {", "    title: (", "      <span>A</span>", "    ),", "  },", "];"].join("\n");
    const zeichenkette = ["const columns = [", "  {", "    title: \"A\",", "  },", "];"].join("\n");
    const ternaer = ["const columns = [", "  {", "    title: (kurz ? \"A\" : \"B\"),", "  },", "];"].join("\n");
    const ohneTabelle = ["const abschnitte = [", "  {", "    title: <span>A</span>,", "  },", "];"].join("\n");

    expect(jsxSpaltentitel(einzeilig)).toBe(true);
    expect(jsxSpaltentitel(geklammert)).toBe(true);
    expect(jsxSpaltentitel(zeichenkette)).toBe(false);
    expect(jsxSpaltentitel(ternaer)).toBe(false);
    expect(jsxSpaltentitel(ohneTabelle)).toBe(false);
  });
});
