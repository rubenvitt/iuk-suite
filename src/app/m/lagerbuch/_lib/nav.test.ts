import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { aktiverEintrag } from "@/core/shell/SuiteNav";
import { LAGERBUCH_NAV } from "./nav";

describe("LAGERBUCH_NAV: die neunzehn Ziele", () => {
  it("führt genau die 19 Einträge in Abschnitten, in dieser Reihenfolge", () => {
    expect(LAGERBUCH_NAV).toEqual([
      { key: "uebersicht", title: "Übersicht", href: "/verwaltung", ikon: "uebersicht" },
      { key: "artikel", title: "Artikel", href: "/verwaltung/artikel", ikon: "artikel", abschnitt: "Bestand" },
      { key: "verfall", title: "Verfall", href: "/verwaltung/verfall", ikon: "verfall", abschnitt: "Bestand" },
      { key: "inventur", title: "Inventur", href: "/verwaltung/inventur", ikon: "inventur", abschnitt: "Bestand" },
      { key: "bestellung", title: "Bestellung", href: "/verwaltung/bestellung", ikon: "bestellung", abschnitt: "Bestand" },
      // DRK-297: die Schraenke des Handlagers.
      { key: "lagerorte", title: "Lagerorte", href: "/verwaltung/lagerorte", ikon: "lagerorte", abschnitt: "Bestand" },
      // DRK-305: der erste von zwei Eintraegen, die NICHT nach /verwaltung fuehren.
      { key: "entnahme", title: "Entnahme", href: "/helfer", ikon: "entnahme", abschnitt: "Bestand" },
      { key: "fahrzeuge", title: "Fahrzeuge & Taschen", href: "/verwaltung/fahrzeuge", ikon: "fahrzeuge", abschnitt: "Einheiten & Geräte" },
      { key: "vorlagen", title: "Vorlagen", href: "/verwaltung/vorlagen", ikon: "vorlagen", abschnitt: "Einheiten & Geräte" },
      { key: "geraete", title: "Geräte", href: "/verwaltung/geraete", ikon: "geraete", abschnitt: "Einheiten & Geräte" },
      { key: "sauerstoff", title: "Sauerstoff", href: "/verwaltung/sauerstoff", ikon: "sauerstoff", abschnitt: "Einheiten & Geräte" },
      { key: "checks", title: "Checks", href: "/verwaltung/checks", ikon: "checks", abschnitt: "Prüfungen" },
      // DRK-305: der zweite. `pruefen` ist die HANDLUNG, `checks` daneben die
      // Historie — zwei Eintraege im selben Abschnitt, deshalb zwei Zeichen.
      { key: "pruefen", title: "Check durchführen", href: "/helfer/check", ikon: "pruefen", abschnitt: "Prüfungen" },
      { key: "bz", title: "BZ-Kontrolle", href: "/verwaltung/bz", ikon: "bz", abschnitt: "Prüfungen" },
      { key: "journal", title: "Journal", href: "/verwaltung/journal", ikon: "journal", abschnitt: "Protokoll" },
      { key: "etiketten", title: "Etiketten", href: "/verwaltung/etiketten", ikon: "etiketten", abschnitt: "Einrichtung" },
      // DRK-312: das A7-Etikett je Handlager bzw. Einheit. EIGENES Zeichen —
      // „Etiketten" steht im selben Abschnitt, und zwei gleiche Zeichen waeren
      // dort nicht auseinanderzuhalten (Begruendung an `core/shell/types.ts`).
      { key: "ortsetiketten", title: "Ortsetiketten", href: "/verwaltung/ortsetiketten", ikon: "ortsetiketten", abschnitt: "Einrichtung" },
      { key: "tokens", title: "Zugangs-Codes", href: "/verwaltung/tokens", ikon: "tokens", abschnitt: "Einrichtung" },
      { key: "import", title: "Import", href: "/verwaltung/import", ikon: "import", abschnitt: "Einrichtung" },
    ]);
  });

  it("deklariert KEINEN Wurzeleintrag", () => {
    expect(LAGERBUCH_NAV.some((e) => e.href === "/")).toBe(false);
  });

  /*
   * ⚠️ ZWEI PRAEFIXE SEIT DRK-305, NICHT MEHR EINES. „Entnahme" und „Check
   * durchfuehren" fuehren in den HELFER-Ast: dieselben Flaechen, die eine
   * Helferin nach dem Kaertchen-Scan sieht, nur ohne Kaertchen und ohne Bindung
   * an ein einzelnes Fahrzeug. Eine zweite Fassung im Verwaltungsrahmen waere
   * eine zweite Wahrheit darueber, wie gebucht und geprueft wird.
   *
   * Was UNVERAENDERT gilt und die eigentliche Zusage dieses Tests ist: die
   * AEUSZERE Pfadform. Ein `/m/lagerbuch`-Praefix wuerde auf dem Modul-Host
   * doppelt praefixiert (Falle 49).
   */
  it("traegt AUSSCHLIESZLICH die aeuszere Pfadform", () => {
    for (const e of LAGERBUCH_NAV) {
      expect(e.href, e.key).toMatch(/^\/(verwaltung|helfer)/);
      expect(e.href, e.key).not.toMatch(/^\/m\/lagerbuch/);
    }
  });

  it("hat eindeutige Schluessel und eindeutige Ziele", () => {
    expect(new Set(LAGERBUCH_NAV.map((e) => e.key)).size).toBe(19);
    expect(new Set(LAGERBUCH_NAV.map((e) => e.href)).size).toBe(19);
  });

  it("fuehrt weder kein-zugriff noch identitaeten", () => {
    const ziele = LAGERBUCH_NAV.map((e) => e.href).join(" ");
    expect(ziele).not.toMatch(/kein-zugriff|identitaeten/);
  });

  /*
   * Seit dem Phosphor-Umbau (core/shell/navIkonen.tsx) trägt jeder Eintrag ein
   * `ikon` — hier je Eintrag identisch mit `key`, weil beide dieselbe fachliche
   * Kategorie benennen. Ob NAV_IKONEN zu jedem dieser Schlüssel eine Komponente
   * kennt, prüft `core/shell/navIkonen.test.tsx`, nicht diese Datei — sie kennt
   * die Komponentenmap gar nicht (die liegt in einem "use client"-Modul, das
   * eine Server-gelesene Datei wie diese nicht laden darf).
   */
  it("trägt je Eintrag ein Zeichen gleich dem Schlüssel und kein Feld außerhalb von SuiteNavItem", () => {
    for (const e of LAGERBUCH_NAV) {
      expect(e.ikon, e.key).toBe(e.key);
      // Positivliste statt exakter Feldmenge: `abschnitt` ist optional, trägt es
      // also nicht jeder Eintrag („Übersicht" steht vor der ersten Überschrift).
      // Die Liste ist genau die Feldmenge von `SuiteNavItem` — kein Eintrag darf
      // etwas tragen, das der Typ nicht vorsieht, insbesondere kein `icon`.
      expect(
        Object.keys(e).every((k) => ["key", "href", "title", "ikon", "abschnitt"].includes(k)),
      ).toBe(true);
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
