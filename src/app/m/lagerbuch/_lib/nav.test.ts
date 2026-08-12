import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { aktiverEintrag } from "@/core/shell/SuiteNav";
import { LAGERBUCH_NAV } from "./nav";

describe("LAGERBUCH_NAV: die fuenfzehn Ziele", () => {
  it("fuehrt genau die 15 Eintraege aus SideNav.tsx:9-23, in dieser Reihenfolge", () => {
    expect(LAGERBUCH_NAV).toEqual([
      { key: "uebersicht", title: "Übersicht", href: "/verwaltung", ikon: "uebersicht" },
      { key: "artikel", title: "Artikel", href: "/verwaltung/artikel", ikon: "artikel" },
      { key: "verfall", title: "Verfall", href: "/verwaltung/verfall", ikon: "verfall" },
      { key: "fahrzeuge", title: "Fahrzeuge", href: "/verwaltung/fahrzeuge", ikon: "fahrzeuge" },
      { key: "vorlagen", title: "Vorlagen", href: "/verwaltung/vorlagen", ikon: "vorlagen" },
      { key: "checks", title: "Checks", href: "/verwaltung/checks", ikon: "checks" },
      { key: "bz", title: "BZ-Kontrolle", href: "/verwaltung/bz", ikon: "bz" },
      { key: "sauerstoff", title: "Sauerstoff", href: "/verwaltung/sauerstoff", ikon: "sauerstoff" },
      { key: "geraete", title: "Geräte", href: "/verwaltung/geraete", ikon: "geraete" },
      { key: "bestellung", title: "Bestellung", href: "/verwaltung/bestellung", ikon: "bestellung" },
      { key: "inventur", title: "Inventur", href: "/verwaltung/inventur", ikon: "inventur" },
      { key: "journal", title: "Journal", href: "/verwaltung/journal", ikon: "journal" },
      { key: "tokens", title: "Zugangs-Codes", href: "/verwaltung/tokens", ikon: "tokens" },
      { key: "etiketten", title: "Etiketten", href: "/verwaltung/etiketten", ikon: "etiketten" },
      { key: "import", title: "Import", href: "/verwaltung/import", ikon: "import" },
    ]);
  });

  it("deklariert KEINEN Wurzeleintrag", () => {
    expect(LAGERBUCH_NAV.some((e) => e.href === "/")).toBe(false);
  });

  it("traegt AUSSCHLIESZLICH die aeuszere Pfadform", () => {
    for (const e of LAGERBUCH_NAV) {
      expect(e.href, e.key).toMatch(/^\/verwaltung/);
      expect(e.href, e.key).not.toMatch(/^\/m\/lagerbuch/);
    }
  });

  it("hat eindeutige Schluessel und eindeutige Ziele", () => {
    expect(new Set(LAGERBUCH_NAV.map((e) => e.key)).size).toBe(15);
    expect(new Set(LAGERBUCH_NAV.map((e) => e.href)).size).toBe(15);
  });

  it("fuehrt weder kein-zugriff noch identitaeten", () => {
    const ziele = LAGERBUCH_NAV.map((e) => e.href).join(" ");
    expect(ziele).not.toMatch(/kein-zugriff|identitaeten/);
  });

  /*
   * Seit Task 3 (core/shell/navIkonen.tsx) traegt jeder Eintrag ein `ikon` —
   * hier ist `ikon` je Eintrag identisch mit `key`, weil beide dieselbe
   * fachliche Kategorie benennen. Ob NAV_IKONEN zu jedem dieser Schluessel
   * eine Komponente kennt, prueft `core/shell/navIkonen.test.tsx`, nicht
   * diese Datei — sie kennt die Komponentenmap gar nicht (die liegt in einem
   * "use client"-Modul, das eine Server-gelesene Datei wie diese nicht laden
   * darf).
   */
  it("traegt fuer jeden Eintrag ein Zeichen, gleich dem eigenen Schluessel", () => {
    for (const e of LAGERBUCH_NAV) {
      expect(e.ikon, e.key).toBe(e.key);
      expect(Object.keys(e).sort()).toEqual(["href", "ikon", "key", "title"]);
    }
  });

  it('die Datei traegt kein "use client"', () => {
    const quelle = readFileSync("src/app/m/lagerbuch/_lib/nav.ts", "utf8");
    expect(quelle.slice(0, 200)).not.toMatch(/["']use client["']/);
  });
});

describe("aktiverEintrag gegen LAGERBUCH_NAV", () => {
  it.each([
    ["/verwaltung", "uebersicht", true],
    ["/m/lagerbuch/verwaltung", "uebersicht", true],
    ["/verwaltung/artikel", "artikel", true],
    ["/m/lagerbuch/verwaltung/journal", "journal", true],
    ["/verwaltung/bz", "bz", true],
  ])("%s -> %s", (pfad, schluessel, genau) => {
    expect(aktiverEintrag(pfad, LAGERBUCH_NAV)).toEqual({ schluessel, genau });
  });

  it.each([
    ["/verwaltung/bz/17/kontrolle"],
    ["/verwaltung/geraete/scan"],
    ["/verwaltung/geraete/17"],
    ["/verwaltung/checks/abc"],
    ["/verwaltung/fahrzeuge/42"],
    ["/verwaltung/sauerstoff/7"],
    ["/verwaltung/vorlagen/3"],
    ["/verwaltung/bz/scan"],
    ["/verwaltung/bz/17"],
  ])("%s bekommt KEINE Markierung", (pfad) => {
    expect(aktiverEintrag(pfad, LAGERBUCH_NAV)).toBeNull();
  });

  it("die Uebersicht gewinnt NICHT gegen eine laengere Uebereinstimmung", () => {
    expect(aktiverEintrag("/verwaltung/artikel", LAGERBUCH_NAV)?.schluessel).toBe("artikel");
  });
});
