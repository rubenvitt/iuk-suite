/*
 * ⚠️ WAS DIESER TEST NICHT KANN: pruefen, ob `types.ts` in der RSC-Ebene
 * traegt. In Vitest ist "use client" ein wirkungsloser String, und ein Modul,
 * das dort einen Wert exportiert, exportiert ihn hier immer. Der Beleg fuer
 * Falle 6 ist der Abruf einer Server Component, die LAGERBUCH_NAV liest
 * (Task 3 Step 7, Task 9).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NAV_IKONEN } from "./navIkonen";
import { LAGERBUCH_NAV } from "@/app/m/lagerbuch/_lib/nav";

describe("Nav-Zeichen", () => {
  it("kennt zu jedem im Lagerbuch gesetzten Schluessel eine Komponente", () => {
    const fehlend = LAGERBUCH_NAV
      .map((eintrag) => eintrag.ikon)
      .filter((schluessel) => schluessel !== undefined)
      .filter((schluessel) => !(schluessel in NAV_IKONEN));
    expect(fehlend).toEqual([]);
  });

  it("setzt fuer jeden Lagerbuch-Eintrag ein Zeichen", () => {
    const ohne = LAGERBUCH_NAV.filter((e) => e.ikon === undefined).map((e) => e.key);
    expect(ohne).toEqual([]);
  });

  /*
   * DER GRUND FUER DIESEN TEST: `types.ts` wird von Server Components gelesen
   * (_lib/nav.ts importiert SuiteNavItem von dort und wird in einem
   * RSC-Layout ausgewertet). Traegt die Datei je eine Komponente als WERT,
   * ist das Falle 6 -- HTTP 500 fuer jede Seite mit Navigation, und weder
   * `build` noch dieser Test-Runner sieht es. Deshalb prueft dieser Test den
   * QUELLTEXT: types.ts darf react-icons ueberhaupt nicht kennen.
   */
  it("haelt types.ts frei von jedem Zeichen-Import", () => {
    const quelle = readFileSync("src/core/shell/types.ts", "utf8");
    expect(quelle).not.toMatch(/react-icons/);
    expect(quelle).not.toMatch(/@ant-design\/icons/);
  });

  it("markiert navIkonen als Client-Modul", () => {
    const quelle = readFileSync("src/core/shell/navIkonen.tsx", "utf8");
    expect(quelle.trimStart().startsWith('"use client"')).toBe(true);
  });
});
