import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { PFADE, type IkonName } from "./ikonen";

const WURZEL = "src/app/m/lagerbuch";

function alleDateien(verzeichnis: string, endungen: string[]): string[] {
  const treffer: string[] = [];
  for (const eintrag of readdirSync(verzeichnis)) {
    const pfad = join(verzeichnis, eintrag);
    if (statSync(pfad).isDirectory()) treffer.push(...alleDateien(pfad, endungen));
    else if (endungen.some((e) => pfad.endsWith(e))) treffer.push(pfad);
  }
  return treffer;
}

/** Kommentare duerfen die verbotene Schreibweise als Begruendung nennen. */
function ohneKommentare(quelle: string): string {
  return quelle
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

/**
 * DER MODUL-EIGENE RIEGEL — UND WARUM DER VORHANDENE NICHT REICHT.
 *
 * `core/shell/icons.test.ts:147-171` ist ein repo-weiter Scan ueber vier
 * Importformen: er findet jede Datei, die `@ant-design/icons` OHNE
 * "use client" importiert. Beim Portieren schlaegt er zu, und das ist gut.
 *
 * Was er strukturell NICHT sieht: eine Client-Insel mit antd-Icons ist fuer
 * ihn ein GUELTIGER Zustand — die Regel aus Spec 6.5.1 geht weiter als die
 * Falle. Und er sieht weder einen unbekannten IkonName noch eine zweite lokale
 * SVG-Quelle neben `_ui/ikonen.tsx`.
 *
 * Ein Tippfehler ergibt `PFADE["warnungg"] === undefined`, ein
 * `<path d={undefined}>` und ein UNSICHTBARES Zeichen — gueltiges SVG, HTTP
 * 200, kein Log. Eine zweite rohe `<svg>`-Quelle waere wieder ein zweites
 * Zeichenvokabular, das von der zentralen Union unbemerkt abweichen kann.
 */
describe("Ikonen-Riegel: kein fremdes Zeichenpaket und keine zweite SVG-Quelle", () => {
  const dateien = alleDateien(WURZEL, [".ts", ".tsx"]);

  it("findet ueberhaupt Dateien (sonst prueft der Scan nichts)", () => {
    expect(dateien.length).toBeGreaterThan(10);
  });

  it("keine Datei importiert @ant-design/icons — auch nicht mit \"use client\"", () => {
    const schuldige = dateien.filter((d) =>
      /from\s+["']@ant-design\/icons/.test(readFileSync(d, "utf8")),
    );
    expect(schuldige.map((d) => relative(WURZEL, d))).toEqual([]);
  });

  it("keine Datei importiert lucide-react (die Suite fuehrt das Paket nicht)", () => {
    const schuldige = dateien.filter((d) =>
      /from\s+["']lucide-react["']/.test(readFileSync(d, "utf8")),
    );
    expect(schuldige.map((d) => relative(WURZEL, d))).toEqual([]);
  });

  it("keine Datei importiert core/shell/icons (das ist core-Code fuer die Kopfzeile)", () => {
    const schuldige = dateien.filter((d) =>
      /from\s+["'](@\/core\/shell\/icons|.*core\/shell\/icons)["']/.test(readFileSync(d, "utf8")),
    );
    expect(schuldige.map((d) => relative(WURZEL, d))).toEqual([]);
  });

  it("nur ikonen.tsx enthaelt ein rohes `<svg>`", () => {
    const schuldige = alleDateien(WURZEL, [".tsx"])
      .filter((d) => !d.endsWith("/_ui/ikonen.tsx"))
      .filter((d) => /<svg\b/.test(ohneKommentare(readFileSync(d, "utf8"))));
    expect(schuldige.map((d) => relative(WURZEL, d))).toEqual([]);
  });

  it("ikonen.tsx traegt KEIN \"use client\" — das machte Falle 7 zu Falle 6", () => {
    const quelle = readFileSync(join(WURZEL, "_ui/ikonen.tsx"), "utf8");
    expect(ohneKommentare(quelle)).not.toMatch(/^\s*["']use client["'];/m);
  });
});

describe("Ikonen-Riegel: jeder benutzte Name existiert", () => {
  const tsx = alleDateien(WURZEL, [".tsx"]).filter((d) => !d.endsWith("ikonen.tsx"));

  it("jeder `<Ikone name=\"…\">` steht als Schluessel in PFADE", () => {
    const fehlend: string[] = [];
    for (const datei of tsx) {
      const quelle = readFileSync(datei, "utf8");
      for (const treffer of quelle.matchAll(/<Ikone\s[^>]*name=["']([^"']+)["']/g)) {
        if (!(treffer[1] in PFADE)) fehlend.push(`${relative(WURZEL, datei)}: "${treffer[1]}"`);
      }
    }
    expect(fehlend).toEqual([]);
  });

  it("jedes `name={\"…\" satisfies IkonName}` und jede IkonName-Konstante ebenso", () => {
    const fehlend: string[] = [];
    for (const datei of tsx) {
      const quelle = readFileSync(datei, "utf8");
      for (const treffer of quelle.matchAll(/["']([a-z-]+)["']\s+satisfies\s+IkonName/g)) {
        if (!(treffer[1] in PFADE)) fehlend.push(`${relative(WURZEL, datei)}: "${treffer[1]}"`);
      }
    }
    expect(fehlend).toEqual([]);
  });
});

describe("Ikonen: die Union ist die Autoritaet", () => {
  it("fuehrt genau 36 Namen", () => {
    expect(Object.keys(PFADE)).toHaveLength(36);
  });

  it("fuehrt die acht Fachzeichen namentlich", () => {
    const fach: IkonName[] = [
      "warnung",
      "medizin",
      "objekt",
      "sauerstoff",
      "akku",
      "verfall",
      "handlager-griff",
      "fahrzeug",
    ];
    for (const name of fach) expect(PFADE[name], name).toBeTruthy();
  });

  it("jeder Pfad ist ein nicht leeres `d`-Attribut", () => {
    for (const [name, d] of Object.entries(PFADE)) {
      expect(typeof d, name).toBe("string");
      expect(d.trim().length, name).toBeGreaterThan(4);
      expect(d, `${name} beginnt nicht mit einem Move-Befehl`).toMatch(/^[Mm]/);
    }
  });

  it("kein Pfad ist doppelt vergeben", () => {
    const werte = Object.values(PFADE);
    expect(new Set(werte).size).toBe(werte.length);
  });
});
