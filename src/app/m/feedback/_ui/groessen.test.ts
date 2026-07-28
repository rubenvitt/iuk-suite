import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * `size` STEHT AUF KEINEM BEDIENELEMENT — `controlHeight` IST 56.
 *
 * Die Regel steht in docs/design/README.md (Falle 4) und wird im Modul selbst
 * zitiert (`Zuordnung.tsx`, Kommentar an der AutoComplete-Zeile). Sie war
 * trotzdem viermal verletzt. Die Zahlen dahinter, gemessen im Browser:
 * `controlHeightSM` leitet antd aus `controlHeight` ab und ergibt hier **42px**
 * — nicht die 24 aus antds Vorgabe, aber auch nicht die 44, die eine
 * Trefferflaeche braucht. Der schwerste Fall war das „…"-Menue der
 * Verlaufszeile: 24px BREIT, und es ist das einzige Bedienelement der Zeile.
 *
 * DIE AUSNAHME IST BENANNT, NICHT UEBERSEHEN: `Aktualisierer.tsx` traegt
 * `size="small"` mit einer Begruendung im Quelltext („die Regel richtet sich
 * gegen `size=\"large\"`"). Sie steht unten in AUSNAHMEN und faellt auf, wenn
 * jemand eine zweite hinzufuegt, ohne sie hier einzutragen.
 *
 * `size` am `<Table>` selbst ist KEIN Bedienelement, sondern Zellpolster — der
 * Scan sucht deshalb nach `size=` an `<Button`, nicht an jeder Komponente.
 * ACHTUNG: das heisst nicht, dass `elementVor` das Tag als `"Table"` erkennt.
 * `<Table<VerlaufZeile>>` und aehnliche generische Aufrufe lassen den
 * TypeScript-Typparameter wie ein zweites geoeffnetes Tag aussehen, und
 * `elementVor` ordnet `size=` dann diesem Parameter zu (z. B. `"VerlaufZeile"`,
 * `"ServiceRow"`) — nie `"Table"`. Der Ausschluss funktioniert trotzdem, weil
 * der Filter unten strikt auf `=== "Button"` prueft und ein Typparameter das
 * nie ist; es ist nur nicht dieselbe Zusicherung, die der erste Satz nahelegt.
 */
const AUSNAHMEN = new Set(["Aktualisierer.tsx"]);

function tsxDateien(verzeichnis: string): string[] {
  return readdirSync(verzeichnis)
    .filter((n) => n.endsWith(".tsx") && !n.endsWith(".test.tsx"))
    .map((n) => join(verzeichnis, n));
}

/**
 * Das JSX-Element, zu dem eine Prop gehoert: das zuletzt geoeffnete Tag vor der
 * Fundstelle.
 *
 * WARUM NICHT `\/<Button\b[^>]*>\/`, was naeher laege: eine Button-Prop kann eine
 * Pfeilfunktion enthalten (`onClick={() => entfernen(id)}`), und deren `>`
 * beendet die Zeichenklasse `[^>]` mitten im Starttag. Steht `size` dahinter,
 * findet der naive Ausdruck es nicht — der Scan waere still unvollstaendig,
 * und genau davon hat dieses Projekt schon genug.
 *
 * Die Grenze der Heuristik, damit sie niemand ueberschaetzt: sie sieht
 * Verschachtelung nur ueber die Reihenfolge im Text. Ein `size` an einem
 * Element INNERHALB eines Buttons wird korrekt diesem inneren Element
 * zugeordnet — das ist gewollt. Ein `size` in einem Kommentar zwischen zwei
 * Tags wuerde falsch zugeordnet; deshalb prueft der Scan die kommentarfreie
 * Quelle.
 *
 * Eine zweite Grenze, die dasselbe Kommentar-Entfernen mitbringt: `\/\/[^\n]*`
 * kennt keine Zeichenketten und behandelt ein `//` INNERHALB eines Strings
 * (z. B. in einer URL wie `"https://…"`) genauso wie einen Zeilenkommentar —
 * alles danach bis zum Zeilenende faellt weg. Ein `size=` an einem `<Button`
 * hinter so einem `//` in derselben Zeile wuerde der Scan still nicht sehen.
 * Heute gibt es keinen solchen Fall im Pruefbereich (das einzige `https://`
 * steht in einem Blockkommentar, der vorher schon entfernt wird), aber die
 * Grenze existiert unabhaengig davon.
 */
function elementVor(quelle: string, index: number): string {
  const treffer = [...quelle.slice(0, index).matchAll(/<([A-Z][A-Za-z]*)/g)];
  return treffer.length > 0 ? treffer[treffer.length - 1][1] : "";
}

describe("Bedienelemente ohne `size`", () => {
  const dateien = [
    ...tsxDateien("src/app/m/feedback/_ui"),
    ...tsxDateien("src/app/m/portal/admin"),
  ];

  it("findet ueberhaupt Dateien (sonst prueft der Scan nichts)", () => {
    expect(dateien.length).toBeGreaterThan(10);
  });

  for (const datei of dateien) {
    const name = datei.split("/").pop()!;
    it(`${name}: kein size an einem Button`, () => {
      const quelle = readFileSync(datei, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/[^\n]*/g, "");
      // `size=` mit Gleichheitszeichen: `size: "small"` in einem
      // `pagination`-Objekt ist eine Objekteigenschaft, kein JSX-Attribut, und
      // betrifft die Blaetterleiste, kein Bedienelement.
      const treffer = [...quelle.matchAll(/\bsize=/g)]
        .map((m) => ({ element: elementVor(quelle, m.index!), stelle: m.index! }))
        .filter((t) => t.element === "Button");

      if (AUSNAHMEN.has(name)) {
        expect(treffer.length, `${name} ist als Ausnahme gefuehrt — steht sie noch da?`).toBe(1);
      } else {
        const zeilen = treffer.map((t) => quelle.slice(0, t.stelle).split("\n").length);
        expect(treffer, `${datei}: size an einem Button in Zeile ${zeilen.join(", ")}`).toEqual([]);
      }
    });
  }
});
