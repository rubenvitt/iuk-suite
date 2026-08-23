// @vitest-environment jsdom
// src/app/m/radio/_ui/ikonen.test.tsx
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { mount, unmount, queryAll } from "@/app/m/qr/_lib/test-dom";
import { Ikone, IKON_NAMEN } from "./ikonen";

const QUELLE = "src/app/m/radio/_ui/ikonen.tsx";
const MODUL = "src/app/m/radio";

/**
 * ⛔ DER SPEZIFIZIERER STEHT NUR HIER ZUSAMMENGESETZT, NICHT AM STUECK. Diese Datei ist
 * selbst eine Quelldatei unter `m/radio/`, und `src/core/shell/icons.test.ts` scannt
 * `.test.tsx` zwar nicht mit (`icons.test.ts:70`) — der Scan UNTEN aber schon, wenn ihn
 * jemand spaeter auf Testdateien ausweitet. Ein Wert, der sich selbst ausloest, wird
 * abgeschaltet statt repariert.
 */
const NACKTER_SPEZIFIZIERER = "@ant-design" + "/icons";

/**
 * Kopie von `ohneKommentare()` aus `src/app/m/radio/riegel.test.ts:181-201`
 * (Hausform; `lagerbuch/_ui/HelferRahmen.test.tsx:40-60` haelt es genauso).
 *
 * ⚠️ OHNE SIE IST DER SCAN AUF SEINER EIGENEN BEGRUENDUNG ROT: `ikonen.tsx` schreibt
 * Falle 7 in seinen Kopfkommentar und nennt das Paket dabei beim Namen — genau der Satz,
 * den der Plan konserviert haben will. Die naheliegende „Reparatur" waere, ihn zu
 * loeschen. `riegel.test.ts` exportiert die Funktion nicht, und dies ist ein anderer
 * Testkoerper — deshalb die lokale Kopie.
 */
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
        if (zu === -1) {
          imBlock = true;
          return zeile.slice(0, auf);
        }
        return zeile.slice(0, auf) + " ".repeat(zu + 2 - auf) + zeile.slice(zu + 2);
      }
      return zeile.trimStart().startsWith("//") ? "" : zeile;
    })
    .join("\n");
}

/** Alle ausgelieferten `.ts`/`.tsx` des Moduls — Testdateien ausgenommen, wie `riegel.test.ts:143-157`. */
function quellDateien(wurzel: string = MODUL, treffer: string[] = []): string[] {
  for (const eintrag of readdirSync(wurzel)) {
    const pfad = join(wurzel, eintrag);
    if (statSync(pfad).isDirectory()) {
      if (eintrag === "migrations") continue;
      quellDateien(pfad, treffer);
      continue;
    }
    if (!/\.tsx?$/.test(eintrag)) continue;
    if (/\.(?:test|spec)\.tsx?$/.test(eintrag)) continue;
    treffer.push(pfad);
  }
  return treffer;
}

afterEach(async () => {
  await unmount();
});

describe("radio-ikonen: Falle 7 — kein fremdes Zeichenpaket unter m/radio/", () => {
  it("nennt @ant-design-icons nicht, in keiner Form", () => {
    /*
     * Entscheidung E5 (`briefs/KOPF.md:581-586`) und Spec:3728-3752. Der nackte
     * Spezifizierer loest in der RSC-Ebene ueber `exports["."].node.import` auf CJS auf und
     * ruft dort `createContext` auf MODULEBENE — HTTP 500 schon beim Import, und
     * `"use client"` behebt es NICHT, es macht es still (`CLAUDE.md`, Falle 7).
     *
     * ⚠️ DIESER SCAN LAEUFT MODULWEIT, NICHT NUR UEBER `_ui/`. Der Brief verlangt `_ui/`
     * UND `_lib/` (`briefs/A16.md:96`); modulweit ist die enthaltende Menge und kostet
     * nichts. `src/core/shell/icons.test.ts` riegelt dieselbe Sache repo-weit ab und
     * laeuft im Tor mit — dieser Fall ist die MODULEIGENE Meldung dafuer, damit ein roter
     * Lauf nicht erst in `core/shell` gesucht wird.
     */
    const verstoesse = quellDateien().filter((pfad) =>
      ohneKommentare(readFileSync(pfad, "utf8")).includes(NACKTER_SPEZIFIZIERER),
    );
    expect(verstoesse, `Falle 7: ${NACKTER_SPEZIFIZIERER} unter ${MODUL}/`).toEqual([]);
  });

  it("die Zeichenquelle selbst traegt kein use client", () => {
    // Falle 6: `IkonName` ist ein TYP und `IKON_NAMEN` ein WERT, den Server Components
    // lesen. `riegel.test.ts:977-1030` deckt nur `_lib/` und `_db/` ab, nicht `_ui/`.
    expect(ohneKommentare(readFileSync(QUELLE, "utf8"))).not.toMatch(/["']use client["']/);
  });
});

describe("radio-ikonen: die Union ist die Autoritaet", () => {
  it("fuehrt genau zwoelf Zeichen, doppelfrei", () => {
    // Spec:3743-3745: von den 18 lucide-Zeichen der Flaeche ueberleben ZWOELF. `Printer`,
    // `Lock`, `QrCode` fallen mit ihren Flaechen weg, `Loader2` ersetzt antds `loading`,
    // `AlertCircle` das `Result` — und `RefreshCw` faellt mit (Spec:3747-3752).
    expect(IKON_NAMEN.length, "Spec:3743 — zwoelf, nicht mehr und nicht weniger").toBe(12);
    expect(new Set(IKON_NAMEN).size).toBe(IKON_NAMEN.length);
  });

  it("jeder Name rendert ein eigenes SVG mit mindestens einer Zeichenanweisung", async () => {
    // Ohne die zweite Zusicherung waere ein leerer Eintrag („<svg/>") vollzaehlig UND
    // gruen — dieselbe Fehlerklasse wie ein Waechter, der `>= 5` statt `= 6` prueft.
    await mount(
      <>
        {IKON_NAMEN.map((name) => (
          <Ikone key={name} name={name} />
        ))}
      </>,
    );
    const svgs = queryAll("svg");
    expect(svgs.length).toBe(IKON_NAMEN.length);
    for (const [i, svg] of svgs.entries()) {
      expect(svg.getAttribute("data-zeichen")).toBe(IKON_NAMEN[i]);
      expect(svg.children.length, `${IKON_NAMEN[i]}: leeres SVG`).toBeGreaterThan(0);
    }
  });

  it("jedes Zeichen ist dekorativ — aria-hidden und nicht fokussierbar", async () => {
    /*
     * Alle Zeichen dieser Flaeche stehen NEBEN einem sichtbaren Text (die Fussnavigation
     * traegt ihre Beschriftung, §4.2). Ein Zeichen ohne `aria-hidden` liese eine
     * Bildschirmleserin denselben Eintrag zweimal hoeren.
     *
     * `focusable="false"` gehoert dazu: der aeltere Trident-Zweig macht ein `<svg>` sonst
     * zu einer Tabulator-Station. Beides steht in `ikonen.tsx` und nicht an den
     * Aufrufstellen — eine Regel, die an jeder Aufrufstelle wiederholt werden muss, wird
     * an der naechsten vergessen (`lagerbuch/_ui/ikonen.tsx:116-118`).
     */
    await mount(
      <>
        {IKON_NAMEN.map((name) => (
          <Ikone key={name} name={name} />
        ))}
      </>,
    );
    for (const svg of queryAll("svg")) {
      expect(svg.getAttribute("aria-hidden"), svg.getAttribute("data-zeichen") ?? "?").toBe("true");
      expect(svg.getAttribute("focusable")).toBe("false");
    }
  });

  it("die Groesse ist ein Prop und wirkt auf Breite UND Hoehe", async () => {
    await mount(<Ikone name={IKON_NAMEN[0]!} groesse={31} />);
    const svg = queryAll("svg")[0]!;
    expect(svg.getAttribute("width")).toBe("31");
    expect(svg.getAttribute("height")).toBe("31");
  });
});
