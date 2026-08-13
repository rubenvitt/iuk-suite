import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { gruppiereNav, hatAbschnitte } from "@/core/shell/navAbschnitte";
import type { SuiteNavItem } from "@/core/shell/types";
import { MODULES } from "@/core/registry";

const OHNE: SuiteNavItem[] = [
  { key: "start", title: "Freigaben", href: "/" },
  { key: "post", title: "Posteingang", href: "/posteingang" },
];

const MIT: SuiteNavItem[] = [
  { key: "uebersicht", title: "Übersicht", href: "/verwaltung" },
  { key: "artikel", title: "Artikel", href: "/verwaltung/artikel", abschnitt: "Bestand" },
  { key: "journal", title: "Journal", href: "/verwaltung/journal", abschnitt: "Protokoll" },
  { key: "verfall", title: "Verfall", href: "/verwaltung/verfall", abschnitt: "Bestand" },
];

describe("hatAbschnitte", () => {
  it("ist falsch für eine flache Liste und wahr, sobald EIN Eintrag einen Abschnitt trägt", () => {
    expect(hatAbschnitte(OHNE)).toBe(false);
    expect(hatAbschnitte(MIT)).toBe(true);
    expect(hatAbschnitte([])).toBe(false);
  });

  it("wertet Leerraum nicht als Abschnitt", () => {
    // Sonst kippte die ganze Navigation in die Seitenleiste, wegen eines
    // Leerzeichens — und die Überschrift wäre unsichtbar.
    expect(hatAbschnitte([{ key: "a", title: "A", href: "/a", abschnitt: "  " }])).toBe(false);
  });
});

describe("gruppiereNav", () => {
  it("stellt Einträge ohne Abschnitt voran, vor jeder Überschrift", () => {
    expect(gruppiereNav(MIT).map((g) => g.titel)).toEqual([null, "Bestand", "Protokoll"]);
    expect(gruppiereNav(MIT)[0].items.map((i) => i.key)).toEqual(["uebersicht"]);
  });

  it("ordnet Abschnitte nach erstem Auftreten, nicht alphabetisch", () => {
    // „Protokoll" steht im Quell-Array vor dem zweiten „Bestand"-Eintrag und
    // trotzdem dahinter: die Reihenfolge gehört dem Abschnitt, nicht dem
    // einzelnen Eintrag.
    const bestand = gruppiereNav(MIT).find((g) => g.titel === "Bestand");
    expect(bestand?.items.map((i) => i.key)).toEqual(["artikel", "verfall"]);
  });

  it("liefert für eine flache Liste genau eine Gruppe ohne Titel", () => {
    expect(gruppiereNav(OHNE)).toEqual([{ titel: null, items: OHNE }]);
  });

  it("liefert für eine leere Liste nichts, statt einer leeren Gruppe", () => {
    expect(gruppiereNav([])).toEqual([]);
  });
});

/*
 * Die Seitenleiste hängt in `FullShell`. Vergäbe ein `minimal`- oder
 * `kiosk`-Modul Abschnitte, verschwänden sie lautlos: die Einträge landeten in
 * der zweiten Zeile, ohne Überschriften. Kein Fehler, kein Log — nur eine
 * Gliederung, die niemand sieht.
 */
describe("Abschnitte gibt es nur in der full-Shell", () => {
  it("kein minimal- oder kiosk-Modul vergibt abschnitt in seiner Nav", () => {
    const nichtFull = MODULES.filter((m) => m.shell !== "full").map((m) => m.key);
    for (const key of nichtFull) {
      const verzeichnis = `src/app/m/${key}`;
      let dateien: string[];
      try {
        dateien = readdirSync(join(verzeichnis, "_lib"));
      } catch {
        continue; // Modul ohne _lib — nichts zu prüfen.
      }
      for (const datei of dateien.filter((d) => /nav\.tsx?$/.test(d))) {
        const quelle = readFileSync(join(verzeichnis, "_lib", datei), "utf8");
        expect(quelle, `${key}/_lib/${datei} vergibt abschnitt, bekommt aber keine Leiste`)
          .not.toMatch(/abschnitt\s*:/);
      }
    }
  });
});
