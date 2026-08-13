// @vitest-environment jsdom
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, afterEach } from "vitest";
import { mount, unmount, query } from "@/app/m/qr/_lib/test-dom";
import { ZEICHEN, Ikone, type IkonName } from "./ikonen";

afterEach(async () => {
  await unmount();
});

const WURZEL = "src/app/m/aufgaben";
const IKON_NAMEN = new Set(Object.keys(ZEICHEN));

function alleDateien(verzeichnis: string, treffer: string[] = []): string[] {
  for (const eintrag of readdirSync(verzeichnis)) {
    const pfad = join(verzeichnis, eintrag);
    if (statSync(pfad).isDirectory()) {
      alleDateien(pfad, treffer);
      continue;
    }
    if (!/\.tsx?$/.test(eintrag)) continue;
    if (/\.test\.tsx?$/.test(eintrag)) continue; // Tests sind nicht die Quelle, die die Union bindet.
    treffer.push(pfad);
  }
  return treffer;
}

function ohneKommentare(quelle: string): string {
  return quelle.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/**
 * NUR DIE LITERALE FORM (`name="…"` / `name={"…"}`), keine Alias- oder
 * Assertions-Verfolgung ueber Scope-Grenzen wie im Lagerbuch-Vorbild
 * (`lagerbuch/_ui/ikonen.test.ts`): dort entstand die volle AST-Maschine aus
 * 80 realen Aufrufstellen mit lokalen Aliasen. `aufgaben` hat heute genau
 * EINE Aufrufstelle (`Kachel.tsx`, `chevron-rechts`) ohne jede Assertion —
 * eine Maschine fuer einen Anwender waere die Verdopplung, gegen die die
 * `core`-Regel steht (`docs/design/README.md`: „ein zweiter, heute
 * belegbarer Nutznieszer"). Ein `as IkonName`/`satisfies IkonName` an einem
 * NICHT aufloesbaren Wert bleibt bis dahin `pnpm typecheck`s Sache nicht —
 * TypeScript prueft literale Zuweisungen an `IkonName` schon ohne diesen
 * Test; wer die Maschine braucht, baut sie, wenn ein zweiter Aufrufer mit
 * Alias oder Assertion auftaucht.
 */
function literalIkonNamen(quelle: string): string[] {
  const muster = /<\s*Ikone\b[^>]*?\bname\s*=\s*(?:\{?\s*["']([^"']+)["']\s*\}?)/g;
  return [...ohneKommentare(quelle).matchAll(muster)].map((m) => m[1]);
}

describe("Ikonen-Riegel: die Union bindet jede literale Aufrufstelle", () => {
  const dateien = alleDateien(WURZEL);

  it("findet ueberhaupt Dateien (sonst prueft der Scan nichts)", () => {
    expect(dateien.length).toBeGreaterThan(5);
  });

  it("jeder literal benutzte IkonName existiert in der Union", () => {
    const unbekannt: string[] = [];
    for (const datei of dateien) {
      const quelle = readFileSync(datei, "utf8");
      for (const name of literalIkonNamen(quelle)) {
        if (!IKON_NAMEN.has(name)) unbekannt.push(`${datei} -> ${JSON.stringify(name)}`);
      }
    }
    expect(unbekannt).toEqual([]);
  });

  it("ikonen.tsx importiert ausschliesslich react-icons und traegt kein use-client", () => {
    const quelle = readFileSync(join(WURZEL, "_ui/ikonen.tsx"), "utf8");
    const spezifizierer = [...quelle.matchAll(/\bimport\b[\s\S]*?\bfrom\s*["']([^"']+)["']/g)].map(
      (m) => m[1],
    );
    expect([...spezifizierer].sort()).toEqual(["react-icons/lib", "react-icons/pi"]);
    /*
     * DAS "use client"-VERBOT IST DIE WICHTIGSTE ZEILE DIESES TESTS: die
     * Datei exportiert `IkonName` als Typ, der als Datenfeld in Server
     * Components landet. Eine Direktive hier machte aus Falle 7 Falle 6 —
     * HTTP 200 mit still falschem Bild.
     */
    expect(quelle.slice(0, 200)).not.toMatch(/["']use client["']/);
  });
});

describe("Ikonen: die Union ist die Autoritaet", () => {
  const ERWARTET: IkonName[] = [
    "warnung", "uhr", "kalender", "person", "haken", "kreuz", "nachweis-bild",
    "nachweis-text", "routine", "rang-hoch", "rang-runter", "pfeil-links",
    "pfeil-rechts", "plus", "chevron-rechts",
  ];

  it("fuehrt genau die 15 Namen, die Spec §8 braucht — nicht mehr", () => {
    expect(Object.keys(ZEICHEN).sort()).toEqual([...ERWARTET].sort());
  });

  it("bildet jeden Namen auf eine Komponente ab", () => {
    for (const [name, Zeichen] of Object.entries(ZEICHEN)) {
      expect(typeof Zeichen, name).toBe("function");
    }
  });

  it("kein Zeichen ist doppelt vergeben", () => {
    const werte = Object.values(ZEICHEN);
    expect(new Set(werte).size).toBe(werte.length);
  });
});

describe("Ikone-Komponente", () => {
  it("rendert data-zeichen, aria-hidden und ein svg", async () => {
    await mount(<Ikone name="warnung" />);
    const svg = query("svg");
    expect(svg.getAttribute("data-zeichen")).toBe("warnung");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
  });

  it("uebernimmt die Groesze", async () => {
    await mount(<Ikone name="uhr" groesse={24} />);
    expect(query("svg").getAttribute("width")).toBe("24");
  });
});
