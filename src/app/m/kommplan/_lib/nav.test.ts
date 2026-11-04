import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { kommplanNav } from "./nav";

/** Die äußere Pfadform → die Datei, die diese Route bedient (Vorbild `einsatzbuch/_lib/nav.test.ts`). */
const ROUTEN: Record<string, string> = {
  "/": "src/app/m/kommplan/(intern)/page.tsx",
  "/archiv": "src/app/m/kommplan/(intern)/archiv/page.tsx",
  "/bibliothek": "src/app/m/kommplan/(intern)/(verwaltung)/bibliothek/page.tsx",
  "/einstellungen": "src/app/m/kommplan/(intern)/(verwaltung)/einstellungen/page.tsx",
};

describe("kommplanNav", () => {
  it("Zugangsgruppe: Pläne und Archiv, keine Verwaltung", () => {
    expect(kommplanNav(false).map((e) => e.title)).toEqual(["Pläne", "Archiv"]);
  });

  it("Admin: dazu Bibliothek und Einstellungen", () => {
    expect(kommplanNav(true).map((e) => e.title)).toEqual(["Pläne", "Archiv", "Bibliothek", "Einstellungen"]);
  });

  it("zeigt mit jedem href auf eine Route, die es gibt, in der äußeren Pfadform", () => {
    for (const eintrag of kommplanNav(true)) {
      const datei = ROUTEN[eintrag.href];
      expect(datei, `kein bekanntes Ziel für ${eintrag.key} (${eintrag.href})`).toBeDefined();
      expect(existsSync(datei), `${datei} fehlt`).toBe(true);
      expect(eintrag.href.startsWith("/m/kommplan"), eintrag.key).toBe(false);
    }
  });
});
