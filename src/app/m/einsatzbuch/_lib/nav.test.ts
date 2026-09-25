import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EINSATZBUCH_NAV } from "./nav";

/*
 * Kopplung zwischen Navigation und Routen (Vorbild `uav/_lib/nav.test.ts`): ein Eintrag auf
 * eine Route, die es nicht gibt, ist ein 404 mit Einladung, und kein Tor sieht ihn — `href`
 * ist eine Zeichenkette. Die Zugriffsfrage stellt sich nicht: alle Ziele hängen am selben
 * Layout mit Host- und Gruppenriegel.
 */

/** Die äußere Pfadform → die Datei, die diese Route bedient. */
const ROUTEN: Record<string, string> = {
  "/": "src/app/m/einsatzbuch/(verwaltung)/page.tsx",
  "/stammdaten": "src/app/m/einsatzbuch/(verwaltung)/stammdaten/page.tsx",
  "/rechner": "src/app/m/einsatzbuch/(verwaltung)/rechner/page.tsx",
  "/einstellungen": "src/app/m/einsatzbuch/(verwaltung)/einstellungen/page.tsx",
  "/reader": "src/app/m/einsatzbuch/(verwaltung)/reader/page.tsx",
};

describe("EINSATZBUCH_NAV", () => {
  // Über einer leeren Liste wären alle `for`-Fälle leer-grün.
  it("führt genau fünf Einträge", () => {
    expect(EINSATZBUCH_NAV).toHaveLength(5);
  });

  it("zeigt mit jedem href auf eine Route, die es gibt", () => {
    for (const eintrag of EINSATZBUCH_NAV) {
      const datei = ROUTEN[eintrag.href];
      expect(datei, `kein bekanntes Ziel für ${eintrag.key} (${eintrag.href})`).toBeDefined();
      expect(existsSync(datei), `${datei} fehlt`).toBe(true);
    }
  });

  it("trägt die äußere Pfadform, nie die innere `/m/einsatzbuch`", () => {
    for (const eintrag of EINSATZBUCH_NAV) {
      expect(eintrag.href.startsWith("/m/einsatzbuch"), eintrag.key).toBe(false);
    }
  });

  it("setzt für jeden Eintrag ein Zeichen", () => {
    expect(EINSATZBUCH_NAV.filter((e) => e.ikon === undefined)).toEqual([]);
  });

  it("liegt in einem Modul ohne `use client` — der Wert wird in RSC gelesen (Falle 6)", () => {
    // In Vitest ist die Direktive ein wirkungsloser String; deshalb prüft der Fall den Quelltext.
    const quelle = readFileSync("src/app/m/einsatzbuch/_lib/nav.ts", "utf8").trimStart();
    expect(quelle.startsWith('"use client"')).toBe(false);
    expect(quelle.startsWith("'use client'")).toBe(false);
  });
});
