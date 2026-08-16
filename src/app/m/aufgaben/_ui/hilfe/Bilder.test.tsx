// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import { BILD_NAMEN, HILFE_SICHTEN, SICHT_SCHLUESSEL, ZYKLUS_KANTEN } from "../../_lib/hilfe";
import { Mechanikbild } from "./Bilder";
import { Skizze } from "./Skizze";

/*
 * DER UEBERLAUF-RIEGEL DER ANLEITUNGSBILDER.
 *
 * ══ WAS ER MISST UND WARUM ES IHN BRAUCHT: die Geometrie der Bilder steht von Hand da
 *    (`Bilder.tsx`, Kopfkommentar). Eine verschobene Zahl faellt in KEINEM anderen Tor auf —
 *    `typecheck` sieht Zahlen, `lint` sieht Zahlen, und ein SVG laeuft still ueber seinen
 *    `viewBox` hinaus: der Inhalt wird abgeschnitten, nicht rot. Genau das prueft diese Datei,
 *    fuer JEDES Bild und JEDE Layoutskizze des Moduls.
 *
 * ══ TEXTBREITE WIRD GESCHAETZT, UND DAS IST EHRLICH SO GEMEINT: jsdom hat keine Schrift und
 *    kennt keine Glyphenbreiten (`getComputedTextLength` gibt es dort nicht). Der Faktor 0,56 je
 *    Zeichen und Schriftgrad ist an den benutzten Groessen gemessen und eher grosszuegig — der
 *    Test faengt damit den Fall „Beschriftung deutlich zu lang", nicht „einen Punkt zu weit".
 *    Fuer das Genaue gibt es nur den Browser; die e2e-Ueberlaufsweeps in `e2e/aufgaben.spec.ts`
 *    messen das Dokument, nicht den Bildinhalt — diese Aussage hier besitzt sonst niemand.
 */

const ZEICHENBREITE = 0.56;
/** Ein Punkt Nachsicht: `stroke-width` und Rundungen sollen nicht als Ueberlauf gelten. */
const TOLERANZ = 1.5;

afterEach(async () => {
  await unmount();
});

interface Befund {
  element: string;
  hinweis: string;
}

function zahl(el: Element, name: string, vorgabe = 0): number {
  const wert = el.getAttribute(name);
  return wert === null ? vorgabe : Number(wert);
}

function punkteAus(el: Element): [number, number][] {
  return (el.getAttribute("points") ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((paar) => {
      const [x, y] = paar.split(",").map(Number);
      return [x, y] as [number, number];
    });
}

/** Alle Punkte eines Elements, die innerhalb des `viewBox` liegen muessen. */
function eckpunkte(el: Element): { punkte: [number, number][]; beschreibung: string } | null {
  switch (el.tagName.toLowerCase()) {
    case "rect": {
      const x = zahl(el, "x");
      const y = zahl(el, "y");
      return {
        punkte: [
          [x, y],
          [x + zahl(el, "width"), y + zahl(el, "height")],
        ],
        beschreibung: `rect(${x},${y})`,
      };
    }
    case "circle": {
      const cx = zahl(el, "cx");
      const cy = zahl(el, "cy");
      const r = zahl(el, "r");
      return {
        punkte: [
          [cx - r, cy - r],
          [cx + r, cy + r],
        ],
        beschreibung: `circle(${cx},${cy})`,
      };
    }
    case "line":
      return {
        punkte: [
          [zahl(el, "x1"), zahl(el, "y1")],
          [zahl(el, "x2"), zahl(el, "y2")],
        ],
        beschreibung: "line",
      };
    case "polyline":
    case "polygon":
      return { punkte: punkteAus(el), beschreibung: el.tagName.toLowerCase() };
    case "text": {
      const x = zahl(el, "x");
      const y = zahl(el, "y");
      const laenge = (el.textContent ?? "").length * zahl(el, "font-size", 11) * ZEICHENBREITE;
      const anker = el.getAttribute("text-anchor") ?? "start";
      const gedreht = (el.parentElement?.getAttribute("transform") ?? "").startsWith("rotate(-90");
      // Gedreht laeuft der Text entlang der Y-Achse: `end` nach unten, `start` nach oben.
      if (gedreht) {
        const ende = anker === "end" ? y + laenge : y - laenge;
        return {
          punkte: [
            [x, Math.min(y, ende)],
            [x, Math.max(y, ende)],
          ],
          beschreibung: `text(gedreht) „${el.textContent}“`,
        };
      }
      const links = anker === "middle" ? x - laenge / 2 : anker === "end" ? x - laenge : x;
      return {
        punkte: [
          [links, y - zahl(el, "font-size", 11)],
          [links + laenge, y],
        ],
        beschreibung: `text „${el.textContent}“`,
      };
    }
    default:
      return null;
  }
}

function pruefeSvg(svg: Element): Befund[] {
  const [, , breite, hoehe] = (svg.getAttribute("viewBox") ?? "0 0 0 0").split(" ").map(Number);
  const befunde: Befund[] = [];
  for (const el of Array.from(svg.querySelectorAll("*"))) {
    const gemessen = eckpunkte(el);
    if (!gemessen) continue;
    for (const [x, y] of gemessen.punkte) {
      if (Number.isNaN(x) || Number.isNaN(y)) {
        befunde.push({ element: gemessen.beschreibung, hinweis: "unlesbare Koordinate" });
        continue;
      }
      if (x < -TOLERANZ || x > breite + TOLERANZ) {
        befunde.push({ element: gemessen.beschreibung, hinweis: `x=${x.toFixed(1)} ausserhalb 0..${breite}` });
      }
      if (y < -TOLERANZ || y > hoehe + TOLERANZ) {
        befunde.push({ element: gemessen.beschreibung, hinweis: `y=${y.toFixed(1)} ausserhalb 0..${hoehe}` });
      }
    }
  }
  return befunde;
}

describe("Die Mechanikbilder", () => {
  for (const name of BILD_NAMEN) {
    describe(name, () => {
      it("bleibt vollstaendig innerhalb seines viewBox", async () => {
        await mount(<Mechanikbild name={name} />);
        const svg = query("svg");
        const befunde = pruefeSvg(svg);
        expect(befunde.map((b) => `${b.element}: ${b.hinweis}`)).toEqual([]);
      });

      /*
       * DIE BESCHREIBUNG IST KEINE KUER: `role="img"` ohne `aria-label` laesst einen
       * Screenreader die einzelnen `<text>`-Knoten als zusammenhanglose Wortfolge vorlesen
       * (`svg.tsx`, `Bildrahmen`). Ein Satz reicht dafuer nicht — deshalb die Untergrenze.
       */
      it("traegt eine Rolle, einen Titel und eine vollstaendige Beschreibung", async () => {
        await mount(<Mechanikbild name={name} />);
        const svg = query("svg");
        expect(svg.getAttribute("role")).toBe("img");
        expect(svg.querySelector("title")?.textContent?.length ?? 0).toBeGreaterThan(5);
        expect((svg.getAttribute("aria-label") ?? "").length).toBeGreaterThan(120);
      });
    });
  }

  it("das Lebenszyklusbild traegt JEDEN Uebergang zusaetzlich als Text", async () => {
    await mount(<Mechanikbild name="lebenszyklus" />);
    const zeilen = queryAll("tbody tr").map((tr) =>
      Array.from(tr.querySelectorAll("td")).map((td) => td.textContent),
    );
    expect(zeilen).toHaveLength(ZYKLUS_KANTEN.length);
    // Die Tabelle ist die genaue Fassung des Bildes — jede Aktion muss darin vorkommen.
    for (const kante of ZYKLUS_KANTEN) {
      expect(zeilen.some((z) => z[1] === kante.aktion), kante.aktion).toBe(true);
    }
  });

  /*
   * DIE GEGENPROBE ZUM UEBERLAUF-RIEGEL: ein Test, der bei null Befunden ebenso gruen bliebe wie
   * bei zehn, beweist nichts. Diese Fixtur belegt, dass `pruefeSvg` einen Ueberlauf wirklich sieht.
   */
  it("der Riegel sieht einen Ueberlauf tatsaechlich", async () => {
    await mount(
      <svg viewBox="0 0 100 50">
        <rect x={10} y={10} width={200} height={10} />
        <text x={90} y={20} fontSize={11}>
          eine viel zu lange Beschriftung
        </text>
      </svg>,
    );
    const befunde = pruefeSvg(query("svg"));
    expect(befunde.length).toBeGreaterThanOrEqual(2);
  });
});

describe("Die Layoutskizzen aller Kapitel", () => {
  for (const schluessel of SICHT_SCHLUESSEL) {
    const sicht = HILFE_SICHTEN[schluessel];
    it(`${schluessel}: bleibt im viewBox und traegt je Block eine Legendenzeile`, async () => {
      await mount(<Skizze titel={sicht.titel} bloecke={sicht.skizze} />);
      expect(pruefeSvg(query("svg")).map((b) => `${b.element}: ${b.hinweis}`)).toEqual([]);
      // Die Nummernscheiben im Bild und die Zeilen der Legende sind DIESELBE Zaehlung.
      expect(queryAll("figcaption ol > li")).toHaveLength(sicht.skizze.length);
      expect(queryAll("svg circle")).toHaveLength(sicht.skizze.length);
    });
  }
});
