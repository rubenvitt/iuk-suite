import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { gruppiereNav } from "@/core/shell/navAbschnitte";
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
 * Bis 2026-08-13 hing die Seitenleiste an `FullShell` allein: ein `minimal`-
 * oder `kiosk`-Modul mit `abschnitt`-Einträgen verlor seine Gliederung
 * lautlos in der zweiten Kopfzeile. Seit `SuiteRahmen` bekommt jedes Modul
 * mit Navigation dieselbe Leiste, `minimal` eingeschlossen — dort würde
 * `abschnitt` heute korrekt gruppiert dargestellt. Nur `kiosk` bekommt
 * weiterhin gar keine Navigation (`Shell.tsx` reicht dort kein `nav` durch).
 *
 * Dieser Test hält trotzdem fest, dass HEUTE kein Modul außerhalb von `full`
 * `abschnitt` vergibt — kein Verbot mehr, sondern eine Markierung: taucht
 * `abschnitt` hier zum ersten Mal in einem `minimal`-Modul auf, soll das eine
 * bewusste Entscheidung sein und keine zufällige.
 */
describe("Abschnitte werden bislang nur in der full-Shell vergeben", () => {
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

describe("die Bauform haengt nicht mehr an den Daten", () => {
  it("exportiert kein `hatAbschnitte` mehr", async () => {
    /*
     * DIE FORM FOLGTE DEN DATEN — und das war der Fehler. `hatAbschnitte`
     * machte ein OPTIONALES Feld zur Entscheidung ueber die Bauform: mit
     * `abschnitt` eine Seitenleiste, ohne eine zweite Kopfzeile. Fuer die
     * benutzende Person war das nicht ablesbar; sie sah keine Datenlage,
     * sie sah zwei Anwendungen.
     *
     * Seit 2026-08-13 bekommt JEDES Modul mit Navigation die Leiste.
     * `gruppiereNav` bleibt — die Gruppierung INNERHALB der Leiste ist
     * weiterhin datengetrieben, nur nicht mehr die Bauform.
     *
     * Dieser Test faengt das Wiedereinfuehren. Ohne ihn kaeme das Praedikat
     * beim naechsten Modul mit vielen Eintraegen als naheliegende Loesung
     * zurueck.
     */
    const modul = await import("@/core/shell/navAbschnitte");
    expect(Object.keys(modul)).not.toContain("hatAbschnitte");
  });
});
