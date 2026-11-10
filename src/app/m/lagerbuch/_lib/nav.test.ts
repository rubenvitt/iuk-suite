import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { aktiverEintrag } from "@/core/shell/SuiteNav";
import { LAGERBUCH_NAV } from "./nav";

describe("LAGERBUCH_NAV: die dreiundzwanzig Ziele", () => {
  it("führt genau die 23 Einträge in Abschnitten, in dieser Reihenfolge", () => {
    // Die Stichworte stehen im eigenen Fall unten — hier geht es um das, was SICHTBAR ist.
    expect(LAGERBUCH_NAV.map((e) => {
      const sichtbar = { ...e };
      delete sichtbar.stichworte;
      return sichtbar;
    })).toEqual([
      { key: "uebersicht", title: "Übersicht", href: "/verwaltung", ikon: "uebersicht" },
      // IDA-380: die drei HANDLUNGEN als eigener Abschnitt direkt unter der
      // Übersicht — sie führen alle drei aus dem Verwaltungsrahmen heraus.
      // DRK-305: der erste von drei Eintraegen, die NICHT nach /verwaltung fuehren.
      { key: "entnahme", title: "Entnahme", href: "/helfer", ikon: "entnahme", abschnitt: "Am Regal / am Fahrzeug" },
      // DRK-313: der zweite — und der einzige Weg in die Auffuellansicht. Er
      // steht direkt unter „Entnahme", weil beide dieselbe Flaeche in
      // entgegengesetzter Richtung sind.
      { key: "auffuellen", title: "Auffüllen", href: "/auffuellen", ikon: "auffuellen", abschnitt: "Am Regal / am Fahrzeug" },
      // DRK-305: der dritte. `pruefen` ist die HANDLUNG, `checks` unter
      // „Prüfungen" die Historie — deshalb zwei Zeichen.
      { key: "pruefen", title: "Check durchführen", href: "/helfer/check", ikon: "pruefen", abschnitt: "Am Regal / am Fahrzeug" },
      { key: "artikel", title: "Artikel", href: "/verwaltung/artikel", ikon: "artikel", abschnitt: "Bestand" },
      { key: "verfall", title: "Verfall", href: "/verwaltung/verfall", ikon: "verfall", abschnitt: "Bestand" },
      { key: "inventur", title: "Inventur", href: "/verwaltung/inventur", ikon: "inventur", abschnitt: "Bestand" },
      { key: "bestellung", title: "Bestellung", href: "/verwaltung/bestellung", ikon: "bestellung", abschnitt: "Bestand" },
      // DRK-297: die Schraenke des Handlagers.
      { key: "lagerorte", title: "Lagerorte", href: "/verwaltung/lagerorte", ikon: "lagerorte", abschnitt: "Bestand" },
      // DRK-314: die Kiste in der Halle. Sie steht bei „Bestand", weil sie ein
      // LAGERORT ist und kein Traeger — und sie fuehrt in die VERWALTUNG, anders
      // als die Helfer-Eintraege unter „Am Regal / am Fahrzeug".
      { key: "entnahmebox", title: "Entnahmebox", href: "/verwaltung/entnahmebox", ikon: "entnahmebox", abschnitt: "Bestand" },
      { key: "fahrzeuge", title: "Fahrzeuge & Taschen", href: "/verwaltung/fahrzeuge", ikon: "fahrzeuge", abschnitt: "Einheiten & Geräte" },
      { key: "vorlagen", title: "Vorlagen", href: "/verwaltung/vorlagen", ikon: "vorlagen", abschnitt: "Einheiten & Geräte" },
      { key: "geraete", title: "Geräte", href: "/verwaltung/geraete", ikon: "geraete", abschnitt: "Einheiten & Geräte" },
      { key: "sauerstoff", title: "Sauerstoff", href: "/verwaltung/sauerstoff", ikon: "sauerstoff", abschnitt: "Einheiten & Geräte" },
      // IDA-298: die gemeldeten Mängel, vor den Checks — sie sind das, was jemand jetzt tun muss.
      { key: "maengel", title: "Mängel", href: "/verwaltung/maengel", ikon: "maengel", abschnitt: "Prüfungen" },
      { key: "checks", title: "Checks", href: "/verwaltung/checks", ikon: "checks", abschnitt: "Prüfungen" },
      { key: "bz", title: "BZ-Kontrolle", href: "/verwaltung/bz", ikon: "bz", abschnitt: "Prüfungen" },
      { key: "journal", title: "Journal", href: "/verwaltung/journal", ikon: "journal", abschnitt: "Protokoll" },
      // IDA-261: die Verdichtung des Journals, deshalb direkt darunter.
      { key: "statistik", title: "Statistik", href: "/verwaltung/statistik", ikon: "statistik", abschnitt: "Protokoll" },
      // DRK-312: die QR-Karte je Handlager bzw. Einheit. EIGENES Zeichen —
      // „Artikeletiketten" steht im selben Abschnitt, und zwei gleiche Zeichen
      // waeren dort nicht auseinanderzuhalten (Begruendung an
      // `core/shell/types.ts`).
      //
      // ⚠️ DRK-406: SIE STEHT JETZT VOR DEN ARTIKELETIKETTEN. Die Reihenfolge
      // ist eine Aussage ueber die Haeufigkeit — hier entstehen die Codes, mit
      // denen der ganze Helfer-Weg anfaengt.
      { key: "ortsetiketten", title: "Ortsetiketten", href: "/verwaltung/ortsetiketten", ikon: "ortsetiketten", abschnitt: "Einrichtung" },
      // ⚠️ DRK-406: „Artikeletiketten" statt „Etiketten" — der Bogen druckt
      // keine Zugangs-Kaertchen mehr. `key` und `href` bleiben: sie sind
      // Adressen, die Beschriftung ist das, was jemand liest (dieselbe Trennung
      // wie bei „Fahrzeuge & Taschen", DRK-309).
      { key: "etiketten", title: "Artikeletiketten", href: "/verwaltung/etiketten", ikon: "etiketten", abschnitt: "Einrichtung" },
      { key: "tokens", title: "Zugangscodes", href: "/verwaltung/tokens", ikon: "tokens", abschnitt: "Einrichtung" },
      { key: "import", title: "Import", href: "/verwaltung/import", ikon: "import", abschnitt: "Einrichtung" },
    ]);
  });

  it("deklariert KEINEN Wurzeleintrag", () => {
    expect(LAGERBUCH_NAV.some((e) => e.href === "/")).toBe(false);
  });

  /*
   * ⚠️ DREI PRAEFIXE, NICHT MEHR EINES. „Entnahme" und „Check durchfuehren"
   * fuehren seit DRK-305 in den HELFER-Ast: dieselben Flaechen, die eine
   * Helferin nach dem Kaertchen-Scan sieht, nur ohne Kaertchen und ohne Bindung
   * an ein einzelnes Fahrzeug. „Auffuellen" fuehrt seit DRK-313 auf eine eigene
   * Flaeche im selben Stil, die ein Kaertchen NIE erreicht. Eine zweite Fassung
   * im Verwaltungsrahmen waere je eine zweite Wahrheit darueber, wie gebucht
   * und geprueft wird.
   *
   * Was UNVERAENDERT gilt und die eigentliche Zusage dieses Tests ist: die
   * AEUSZERE Pfadform. Ein `/m/lagerbuch`-Praefix wuerde auf dem Modul-Host
   * doppelt praefixiert (Falle 49).
   */
  it("traegt AUSSCHLIESZLICH die aeuszere Pfadform", () => {
    for (const e of LAGERBUCH_NAV) {
      expect(e.href, e.key).toMatch(/^\/(verwaltung|helfer|auffuellen)/);
      expect(e.href, e.key).not.toMatch(/^\/m\/lagerbuch/);
    }
  });

  it("hat eindeutige Schluessel und eindeutige Ziele", () => {
    expect(new Set(LAGERBUCH_NAV.map((e) => e.key)).size).toBe(23);
    expect(new Set(LAGERBUCH_NAV.map((e) => e.href)).size).toBe(23);
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
        Object.keys(e).every((k) => ["key", "href", "title", "ikon", "abschnitt", "stichworte"].includes(k)),
      ).toBe(true);
    }
  });

  /*
   * IDA-380 — „Springen zu" fand nur Menünamen. Die Stichworte sind die Wörter,
   * unter denen jemand sucht, bevor er unsere Beschriftung kennt; diese Fälle
   * sind die aus dem Befund.
   */
  it("führt die Suchwörter aus dem Befund an den fachlich passenden Einträgen", () => {
    const stichworte = new Map(LAGERBUCH_NAV.map((e) => [e.key, e.stichworte ?? []]));
    expect(stichworte.get("auffuellen")).toContain("Wareneingang");
    expect(stichworte.get("verfall")).toContain("aussondern");
    // Kein Stichwort ist zugleich eine sichtbare Beschriftung — sonst fände die
    // Suche zwei Ziele für ein Wort, das auf dem Bildschirm genau eines meint.
    const titel = new Set(LAGERBUCH_NAV.map((e) => e.title.toLowerCase()));
    for (const [key, woerter] of stichworte) {
      for (const w of woerter) expect(titel.has(w.toLowerCase()), `${key}: ${w}`).toBe(false);
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
    ["/verwaltung/bz/17/kontrolle", "bz"],
    ["/verwaltung/geraete/scan", "geraete"],
    ["/verwaltung/geraete/17", "geraete"],
    ["/verwaltung/checks/abc", "checks"],
    ["/verwaltung/fahrzeuge/42", "fahrzeuge"],
    ["/verwaltung/sauerstoff/7", "sauerstoff"],
    ["/verwaltung/vorlagen/3", "vorlagen"],
    ["/verwaltung/bz/scan", "bz"],
    ["/verwaltung/bz/17", "bz"],
  ])("%s markiert den Elterneintrag %s als Abschnitt (IDA-392)", (pfad, schluessel) => {
    expect(aktiverEintrag(pfad, LAGERBUCH_NAV)).toEqual({ schluessel, genau: false });
  });

  it("die Uebersicht gewinnt NICHT gegen eine laengere Uebereinstimmung", () => {
    expect(aktiverEintrag("/verwaltung/artikel", LAGERBUCH_NAV)?.schluessel).toBe("artikel");
  });
});
