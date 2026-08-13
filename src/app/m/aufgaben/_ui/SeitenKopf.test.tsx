// @vitest-environment jsdom
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import { SeitenKopf } from "./SeitenKopf";

afterEach(async () => {
  await unmount();
});

describe("SeitenKopf — die drei Zeilen", () => {
  it("Zeile 1: Brotkrume — verlinkte Eintraege als <a>, der letzte als Text ohne <a>", async () => {
    await mount(
      <SeitenKopf
        brotkrume={[{ label: "Verteiler", href: "/m" }, { label: "Person X" }]}
        titel="Person X"
        kontext="x"
      />,
    );
    const links = queryAll<HTMLAnchorElement>(".ant-breadcrumb a");
    expect(links.map((a) => ({ text: a.textContent, href: a.getAttribute("href") }))).toEqual([
      { text: "Verteiler", href: "/m" },
    ]);
    expect(query(".ant-breadcrumb").textContent).toContain("Person X");
  });

  it("Zeile 2: <h1> ist wirklich ein <h1> und traegt den Titel", async () => {
    await mount(<SeitenKopf brotkrume={[]} titel="Aufgaben verteilen" kontext="x" />);
    const h1 = query("h1");
    expect(h1.tagName).toBe("H1");
    expect(h1.textContent).toBe("Aufgaben verteilen");
  });

  it("Zeile 2: die Aktionen stehen rechts in derselben Zeile wie <h1>", async () => {
    await mount(
      <SeitenKopf
        brotkrume={[]}
        titel="T"
        aktionen={<button type="button">Anlegen</button>}
        kontext="x"
      />,
    );
    expect(query("button").textContent).toBe("Anlegen");
  });

  it("Zeile 3: die Kontextzeile traegt den uebergebenen Satz", async () => {
    await mount(<SeitenKopf brotkrume={[]} titel="T" kontext="3 zu verteilen" />);
    expect(query("p").textContent).toBe("3 zu verteilen");
  });

  it("die Reihenfolge ist die Zusage: Aktionen stehen im DOM VOR der Kontextzeile", async () => {
    await mount(
      <SeitenKopf
        brotkrume={[]}
        titel="T"
        aktionen={<button type="button">Anlegen</button>}
        kontext="Kontext"
      />,
    );
    const button = query("button");
    const p = query("p");
    expect(button.compareDocumentPosition(p) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("ohne Aktionen bleibt die Zeile ohne Knopfleiste, die Kontextzeile bleibt", async () => {
    await mount(<SeitenKopf brotkrume={[]} titel="T" kontext="Kontext" />);
    expect(queryAll("button")).toHaveLength(0);
    expect(query("p").textContent).toBe("Kontext");
  });
});

describe("SeitenKopf — die Kontextzeile ist nie leer", () => {
  it("ohne kontext wirft die Komponente statt eine leere Zeile zu rendern", () => {
    // Direkter Aufruf als Funktion (keine Hooks in `SeitenKopf`): der Wurf
    // passiert synchron beim Aufruf, bevor React ueberhaupt etwas rendert.
    expect(() =>
      SeitenKopf({ brotkrume: [], titel: "T", kontext: undefined as unknown as string }),
    ).toThrow(/Kontextzeile/);
  });

  it("eine leere Zeichenkette gilt ebenfalls als leer", () => {
    expect(() => SeitenKopf({ brotkrume: [], titel: "T", kontext: "" })).toThrow(/Kontextzeile/);
  });
});

/*
 * DIE VIER MODULWEITEN QUELLTEXT-VERBOTE — hier und nicht verteilt, weil
 * SeitenKopf genau die Baustelle ist, die `Typography`/`Grid.useBreakpoint`
 * am ehesten anzieht (Seitenkopf, Ueberschriften, Responsive-Umschaltung).
 * Vorbild fuer „vier Importformen, nicht eine" ist `src/core/shell/
 * icons.test.ts`: dort liessen drei Wegwerf-Importeure (`await import`,
 * bloßer `import`, `require`) einen Riegel gruen, der nur `from "…"` sah.
 *
 * KOMMENTARE FALLEN VOR DEM SCAN HERAUS: diese Datei SCHREIBT ueber die vier
 * Verbote (dieser Kommentar tut es gerade) und faehe sonst ueber die eigene
 * Begruendung — derselbe Grund, aus dem `icons.test.ts` `icons.ts` von
 * seinem Importeur-Scan ausnimmt.
 */
const WURZEL = "src/app/m/aufgaben";

function alleQuellDateien(verzeichnis: string, treffer: string[] = []): string[] {
  for (const eintrag of readdirSync(verzeichnis)) {
    const pfad = join(verzeichnis, eintrag);
    if (statSync(pfad).isDirectory()) {
      alleQuellDateien(pfad, treffer);
      continue;
    }
    if (!/\.tsx?$/.test(eintrag)) continue;
    if (/\.test\.tsx?$/.test(eintrag)) continue; // Tests schreiben UEBER die Verbote.
    treffer.push(pfad);
  }
  return treffer;
}

function ohneKommentare(quelle: string): string {
  return quelle.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** Vier Importformen — Muster `core/shell/icons.test.ts`. */
function importSpezifizierer(quelle: string): string[] {
  const muster = /(?:\bfrom|\bimport|\brequire)\s*\(?\s*["']([^"']+)["']/g;
  return [...ohneKommentare(quelle).matchAll(muster)].map((m) => m[1]);
}

type Befund = { datei: string; regel: string };

function scanneDatei(datei: string, quelle: string): Befund[] {
  const roh = ohneKommentare(quelle);
  const befunde: Befund[] = [];

  // 1. Kein `Typography` — auch nicht als Import, auch nicht in Client-Komponenten.
  if (/\bTypography\b/.test(roh)) {
    befunde.push({ datei, regel: "Typography" });
  }

  // 2. Kein `@ant-design/icons`, in keiner der vier Importformen.
  const antdIcons = importSpezifizierer(roh).filter(
    (s) => s === "@ant-design/icons" || s.startsWith("@ant-design/icons/"),
  );
  if (antdIcons.length > 0) {
    befunde.push({ datei, regel: `@ant-design/icons (${antdIcons.join(", ")})` });
  }

  // 3. Kein `size="large"`.
  if (/\bsize\s*=\s*(?:["']large["']|\{\s*["']large["']\s*\})/.test(roh)) {
    befunde.push({ datei, regel: 'size="large"' });
  }

  // 4. Kein `Grid.useBreakpoint` — jedes Vorkommen des Worts, unabhaengig von
  // Praefix oder Importform (`Grid.useBreakpoint`, benannter Import `{ useBreakpoint }`, …).
  // `\bGrid\s*\.\s*useBreakpoint\b` waere hier vollstaendig von `\buseBreakpoint\b`
  // subsummiert (der Punkt davor erfuellt bereits die Wortgrenze) — eine
  // zweite Form ohne eigenen Anwendungsfall waere Attrappe, kein Riegel.
  if (/\buseBreakpoint\b/.test(roh)) {
    befunde.push({ datei, regel: "Grid.useBreakpoint" });
  }

  return befunde;
}

describe("Die vier modulweiten Quelltext-Verbote", () => {
  const dateien = alleQuellDateien(WURZEL);

  it("findet ueberhaupt Dateien (sonst prueft der Scan nichts)", () => {
    expect(dateien.length).toBeGreaterThan(5);
  });

  it("kein `Typography`, kein `@ant-design/icons`, kein size=\"large\", kein Grid.useBreakpoint", () => {
    const befunde = dateien.flatMap((datei) => scanneDatei(datei, readFileSync(datei, "utf8")));
    expect(befunde.map((b) => `${b.datei} -> ${b.regel}`)).toEqual([]);
  });

  /*
   * GEGENPROBE, wie bei `icons.test.ts`: ein Scan, der bei null Treffern
   * ebenso gruen bliebe wie bei zehn, beweist nichts. Diese Negativ-Fixturen
   * bestaetigen, dass `scanneDatei` tatsaechlich die verbotenen Formen sieht.
   */
  const faelle: { name: string; quelle: string; regel: string }[] = [
    { name: "Named Import Typography", quelle: 'import { Typography } from "antd";', regel: "Typography" },
    { name: "Compound-Zugriff Typography.Title", quelle: "<Typography.Title>x</Typography.Title>;", regel: "Typography" },
    { name: "statischer Import @ant-design/icons", quelle: 'import { X } from "@ant-design/icons";', regel: "@ant-design/icons" },
    { name: "Side-Effect-Import @ant-design/icons", quelle: 'import "@ant-design/icons";', regel: "@ant-design/icons" },
    { name: "dynamischer Import @ant-design/icons", quelle: 'void import("@ant-design/icons");', regel: "@ant-design/icons" },
    { name: "require @ant-design/icons", quelle: 'require("@ant-design/icons");', regel: "@ant-design/icons" },
    { name: "size literal large", quelle: '<Button size="large" />;', regel: 'size="large"' },
    { name: "size expression large", quelle: '<Button size={"large"} />;', regel: 'size="large"' },
    { name: "Grid.useBreakpoint", quelle: "const bp = Grid.useBreakpoint();", regel: "Grid.useBreakpoint" },
    { name: "benannter Import useBreakpoint", quelle: 'import { useBreakpoint } from "antd/es/grid";', regel: "Grid.useBreakpoint" },
    { name: "kommentierter Scheinimport bleibt gruen", quelle: '// import { X } from "@ant-design/icons";', regel: "" },
    { name: "size=\"small\" bleibt erlaubt", quelle: '<Button size="small" />;', regel: "" },
  ];

  for (const fall of faelle) {
    it(`Gegenprobe: ${fall.name}`, () => {
      const befunde = scanneDatei("fixtur.tsx", fall.quelle);
      if (fall.regel === "") {
        expect(befunde).toEqual([]);
      } else {
        expect(befunde.some((b) => b.regel.startsWith(fall.regel))).toBe(true);
      }
    });
  }
});
