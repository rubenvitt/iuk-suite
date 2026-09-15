import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * QUELLTEXT-ZUSICHERUNGEN, WEIL KEIN ANDERES TOR SIE LEISTEN KANN.
 *
 * Diese Datei rendert nichts. Sie hält vier Entscheidungen fest, die alle
 * gemeinsam haben, dass ihr Bruch STILL ist — `typecheck`, `lint` und `build`
 * bleiben in jedem der vier Fälle grün:
 *
 * 1. Die Reichweite (nur Arbeitsflächen). Wandert die Insel ins Wurzel-Layout
 *    oder in eine andere Shell, lädt das Widget auf dem Kiosk-Dauerdisplay, im
 *    Druck und auf jeder anonymen Seite. Das sieht niemand am Diff einer
 *    einzelnen Datei.
 * 2. Falle 6: `konfiguration.ts` darf kein `"use client"` tragen. Trüge es
 *    eines, bekäme `FullShell` eine Client-Referenz statt der Werte — HTTP 500
 *    für jede Arbeitsfläche, und **Vitest könnte es strukturell nicht sehen**
 *    (dort ist `"use client"` ein wirkungsloser String).
 * 3. Die Insel MUSS `"use client"` tragen — sie liest `window` und Hooks.
 * 4. Die Abschaltung in E2E. Ohne sie zöge jeder Playwright-Lauf ein Skript von
 *    einem fremden Host nach und ein Widget könnte über den Greifern liegen.
 *    Ein solcher Lauf wird nicht rot, sondern rennabhängig rot — die teuerste
 *    Sorte (dieselbe Bauform wie `POCKET_ID_API_KEY: ""` daneben).
 */

/**
 * ⚠️ OHNE KOMMENTARE GELESEN, UND DAS IST DER UNTERSCHIED ZWISCHEN EINER
 * ZUSICHERUNG UND EINEM ZUFALL.
 *
 * Diese Datei prüft Quelltext auf Zeichenketten. Die Dateien, die sie prüft,
 * sind dicht kommentiert — und die Kommentare handeln naturgemäß von genau den
 * Wörtern, um die es geht („trägt kein `use client`", „nicht `NEXT_PUBLIC_*`",
 * „hier hängen die Umfragen"). Ungefiltert misst der Test damit die
 * Dokumentation statt des Codes, und zwar in BEIDE Richtungen:
 *
 * - Eine Verbotszusicherung wird rot, obwohl der Code sauber ist — so
 *   geschehen bei der ersten Fassung dieser Datei.
 * - Schlimmer: eine Gebotszusicherung wird GRÜN, obwohl der Code die Sache gar
 *   nicht tut. `FullShell` enthielte das Wort „Umfragen" auch dann noch, wenn
 *   die Einbindung entfernt und nur der erklärende Absatz stehen bliebe.
 *
 * Dieselbe Bauform wie `OHNE_KOMMENTARE` in `core/shell/shell-css.test.ts`.
 */
function ohneKommentare(quelle: string): string {
  return quelle
    .replace(/\/\*[\s\S]*?\*\//g, "")
    // Nur Zeilenkommentare am Zeilenanfang: ein `//` mitten in der Zeile könnte
    // in `https://…` stehen.
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

const lies = (pfad: string) => ohneKommentare(readFileSync(pfad, "utf8"));

describe("Reichweite der Umfragen-Einbindung", () => {
  it("hängt in FullShell", () => {
    const quelle = lies("src/core/shell/FullShell.tsx");
    expect(quelle).toContain("Umfragen");
    expect(quelle).toContain("umfragenKonfiguration");
  });

  it.each([
    ["das Wurzel-Layout", "src/app/layout.tsx"],
    ["die schmale Shell", "src/core/shell/MinimalShell.tsx"],
    ["die Kiosk-Shell", "src/core/shell/KioskShell.tsx"],
    ["den geteilten Rahmen", "src/core/shell/SuiteRahmen.tsx"],
  ])("lädt NICHT über %s", (_name, pfad) => {
    expect(lies(pfad)).not.toContain("umfragen");
  });
});

describe("Die Server-/Client-Grenze", () => {
  it("hält konfiguration.ts frei von `use client` (Falle 6)", () => {
    expect(lies("src/core/umfragen/konfiguration.ts")).not.toContain('"use client"');
  });

  it("markiert die Insel als Client-Komponente", () => {
    // Am ROHTEXT: die Direktive muss die erste Anweisung der Datei sein, und
    // genau das prüft diese Zusicherung mit.
    const roh = readFileSync("src/core/umfragen/Umfragen.tsx", "utf8");
    expect(roh.trimStart()).toMatch(/^"use client";/);
  });

  it("belegt die Werte NICHT mit NEXT_PUBLIC_ — sonst stünden sie im Bundle", () => {
    const quelle = lies("src/core/umfragen/konfiguration.ts");
    expect(quelle).not.toContain("NEXT_PUBLIC");
  });

  /**
   * ⚠️ FALLE 7, UND SIE IST HIER BESONDERS VERLOCKEND. Das Farb-Stylesheet
   * (DRK-357) braucht antds aufgelöste Tokens. Die Rechnung dafür steht bewusst
   * in der Client-Insel: `import { theme } from "antd"` löst in der RSC-Ebene
   * über `exports["."].node.import` auf CJS auf, das `createContext` auf
   * Modulebene ruft — HTTP 500 für jede Arbeitsfläche, schon beim IMPORT und
   * nicht erst beim Rendern. `typecheck` und `build` bleiben grün, und **Vitest
   * kann es strukturell nicht sehen** (dort lädt `react` über die
   * `default`-Bedingung, der Import geht klaglos durch). Nur ein echter Abruf
   * zeigt den 500 — deshalb diese Quelltext-Zusicherung.
   *
   * Der naheliegende Umbau, gegen den sie steht: das `<style>` aus `FullShell`
   * zu rendern statt aus der Insel. Das sieht sauberer aus (der Server kennt
   * den Modus schon) und ist es nicht.
   */
  it("hält `aussehen.ts` frei von einem LAUFZEIT-Import aus antd (Falle 7)", () => {
    const quelle = lies("src/core/umfragen/aussehen.ts");
    const importe = [...quelle.matchAll(/^\s*import\s+([\s\S]*?)from\s+"antd"/gm)];
    expect(importe.length, "ein antd-Import").toBe(1);
    expect(importe[0][1], "muss `import type` sein").toMatch(/^type\s/);
  });

  it("rechnet die Tokens in der Insel, nicht in FullShell (Falle 7)", () => {
    expect(lies("src/core/shell/FullShell.tsx")).not.toContain("aussehen");
    const insel = lies("src/core/umfragen/Umfragen.tsx");
    expect(insel).toContain("umfragenFarbCss");
    expect(insel).toContain("getDesignToken");
  });

  /**
   * Die Reichweite des Stylesheets ist die der Insel — nicht mehr. Eine Regel
   * auf `#fbjs` trifft ohne Widget nichts, läge aber sonst auf jeder Kiosk- und
   * Druckseite, und die Grenze wäre nicht mehr an einer Stelle ablesbar.
   */
  it("trägt die Farben mit der Insel, nicht über globales CSS", () => {
    expect(lies("src/core/umfragen/Umfragen.tsx")).toContain("<style");
    expect(lies("src/app/globals.css")).not.toContain("#fbjs");
  });
});

describe("Abschaltung in E2E", () => {
  const KONFIGURATION = lies("playwright.config.ts");

  it.each(["SUITE_FORMBRICKS_APP_URL", "SUITE_FORMBRICKS_WORKSPACE_ID"])(
    "setzt %s leer",
    (name) => {
      expect(KONFIGURATION).toMatch(new RegExp(`${name}:\\s*""`));
    },
  );
});
