import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { MODULES } from "@/core/registry";
import { ALLE_NOTIZEN, sortiereNotizen } from "@/app/m/portal/_lib/neuigkeiten/register";
import { ISO_DATUM, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";
import { formatiereDatum } from "@/app/m/portal/_lib/neuigkeiten/datum";

/**
 * DIE NAHT, DIE EINE NEUE NOTIZ KOSTET — und der Test, der sie bewacht.
 *
 * Eine Notiz besteht aus DREI zusammenpassenden Dingen: der Datei unter
 * `notizen/<modul>/<datum>-<slug>.ts`, den Feldern darin, und der Zeile im
 * `register.ts`. Fehlt die dritte, ist die Notiz geschrieben und niemand sieht
 * sie — kein Typfehler, kein roter Build, keine Fehlermeldung. Es ist dieselbe
 * Form von stillem Ausfall wie beim Migrations-Dreieck aus `CLAUDE.md`, und
 * deshalb dieselbe Abhilfe: das Verzeichnis wird gelesen und gegen das Register
 * gehalten.
 *
 * Der `fs`-Zugriff ist hier ausdrücklich in Ordnung, obwohl `typen.ts` ihn für
 * den Produktionspfad ausschließt: dieser Code läuft in Node, nicht im
 * Container, und hat mit dem Bundle nichts zu tun.
 */
const NOTIZ_WURZEL = join(
  "src",
  "app",
  "m",
  "portal",
  "_lib",
  "neuigkeiten",
  "notizen",
);

/** `<modul>/<datei>.ts` für jede Notizdatei im Verzeichnis. */
function dateienImVerzeichnis(): string[] {
  const gefunden: string[] = [];
  for (const modul of readdirSync(NOTIZ_WURZEL)) {
    const ordner = join(NOTIZ_WURZEL, modul);
    if (!statSync(ordner).isDirectory()) continue;
    for (const datei of readdirSync(ordner)) {
      if (datei.endsWith(".ts")) gefunden.push(`${modul}/${datei}`);
    }
  }
  return gefunden.sort();
}

/** Der Pfad, den eine Notiz laut ihren eigenen Feldern haben MUSS. */
function erwarteterPfad(notiz: Releasenotiz): string {
  return `${notiz.modul}/${notiz.datum}-${notiz.slug}.ts`;
}

describe("Release Notes — Register und Verzeichnis", () => {
  it("jede Notizdatei steht im Register, und jede Registerzeile hat eine Datei", () => {
    expect(ALLE_NOTIZEN.map(erwarteterPfad).sort()).toEqual(dateienImVerzeichnis());
  });

  it("es gibt überhaupt Notizen — ein leeres Register wäre grün und sinnlos", () => {
    expect(ALLE_NOTIZEN.length).toBeGreaterThan(0);
  });

  it("`slug` ist eindeutig — er ist die Sprungmarke der Seite", () => {
    const slugs = ALLE_NOTIZEN.map((n) => n.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe("Release Notes — Felder", () => {
  /*
   * `it.each` statt einer Schleife mit Zusicherungen: ein Fehlschlag nennt dann
   * die Notiz im Testnamen. Wer eine krumme Notiz schreibt, liest sonst „expected
   * false to be true" ohne Hinweis darauf, welche der Dateien gemeint ist.
   */
  const notizen = ALLE_NOTIZEN.map((n) => [erwarteterPfad(n), n] as const);

  it.each(notizen)("%s: Modul steht in der Registry", (_pfad, notiz) => {
    expect(MODULES.map((m) => m.key)).toContain(notiz.modul);
  });

  it.each(notizen)("%s: Datum ist ein echter Tag in ISO-Form", (_pfad, notiz) => {
    expect(notiz.datum).toMatch(ISO_DATUM);
    // `formatiereDatum` gibt die Eingabe unverändert zurück, wenn sie kein
    // gültiger Tag ist (z. B. `2026-13-01`). Ein Ergebnis, das anders aussieht
    // als die Eingabe, ist also der Beleg, dass der Tag existiert.
    expect(formatiereDatum(notiz.datum)).not.toBe(notiz.datum);
  });

  it.each(notizen)("%s: slug ist klein, ohne Umlaute, mit Bindestrichen", (_pfad, notiz) => {
    expect(notiz.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it.each(notizen)("%s: Titel und Inhalt sind nicht leer", (_pfad, notiz) => {
    expect(notiz.titel.trim().length).toBeGreaterThan(0);
    expect(notiz.inhalt.length).toBeGreaterThan(0);
    for (const block of notiz.inhalt) {
      if (block.art === "liste") {
        expect(block.punkte.length).toBeGreaterThan(0);
        for (const punkt of block.punkte) expect(punkt.trim().length).toBeGreaterThan(0);
      } else {
        expect(block.text.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it.each(notizen)("%s: fängt mit einem Absatz an", (_pfad, notiz) => {
    // Der erste Absatz IST die Zusammenfassung (`typen.ts`, „kein Teaser-Feld").
    // Eine Notiz, die mit einer Liste oder einem Hinweis beginnt, hat diesen
    // Satz nicht geschrieben, sondern übersprungen.
    expect(notiz.inhalt[0].art).toBe("absatz");
  });

  it.each(notizen)("%s: höchstens ein Hinweis", (_pfad, notiz) => {
    // Zwei Handlungsaufforderungen in einer Notiz heißen, dass es zwei
    // Änderungen sind — dann sind es zwei Notizen. Das ist die Stilregel aus
    // `CLAUDE.md` als Zusicherung, nicht als Bitte.
    expect(notiz.inhalt.filter((b) => b.art === "hinweis").length).toBeLessThanOrEqual(1);
  });

  it.each(notizen)("%s: kein Markdown im Text", (_pfad, notiz) => {
    /*
     * Der Text wird als Textknoten gerendert, nicht als Markup — `**fett**`
     * käme mit Sternchen auf dem Bildschirm an. Das ist die Art Fehler, die
     * niemand bemerkt, wenn die Notiz aus einem Changelog kopiert wurde und
     * niemand die Seite danach aufruft.
     */
    const texte = notiz.inhalt.flatMap((b) => (b.art === "liste" ? [...b.punkte] : [b.text]));
    for (const text of [notiz.titel, ...texte]) {
      expect(text).not.toMatch(/\*\*|^#{1,6}\s|`/m);
    }
  });
});

describe("Release Notes — Sortierung", () => {
  it("neueste zuerst", () => {
    const daten = ALLE_NOTIZEN.map((n) => n.datum);
    expect([...daten].sort().reverse()).toEqual(daten);
  });

  it("bei gleichem Datum nach slug — damit die Reihenfolge in jedem Lauf dieselbe ist", () => {
    const gemischt: Releasenotiz[] = [
      { modul: "portal", slug: "zwei", datum: "2026-08-16", titel: "B", inhalt: [] },
      { modul: "portal", slug: "eins", datum: "2026-08-16", titel: "A", inhalt: [] },
      { modul: "portal", slug: "alt", datum: "2026-08-15", titel: "C", inhalt: [] },
    ];
    expect(sortiereNotizen(gemischt).map((n) => n.slug)).toEqual(["eins", "zwei", "alt"]);
  });

  it("lässt die Eingabe unangetastet", () => {
    const eingabe: Releasenotiz[] = [
      { modul: "portal", slug: "alt", datum: "2026-08-15", titel: "A", inhalt: [] },
      { modul: "portal", slug: "neu", datum: "2026-08-16", titel: "B", inhalt: [] },
    ];
    sortiereNotizen(eingabe);
    expect(eingabe.map((n) => n.slug)).toEqual(["alt", "neu"]);
  });
});

/**
 * „AUSSCHLIESSLICH ÜBER DAS PORTAL SICHTBAR" IST EINE ANFORDERUNG, KEINE
 * ABSPRACHE — und das hier ist der einzige Riegel, der sie halten kann.
 *
 * Die Ablage trägt sie schon zur Hälfte: die Notizen liegen unter
 * `portal/_lib/`, und `docs/design/README.md` hält fest, dass Modul-Interna kein
 * API sind. Nur ist das eine Regel, die ein `import` bricht, ohne dass irgendein
 * Tor rot wird — `qr` könnte sich morgen eine „Was ist neu"-Kachel bauen, und
 * `typecheck`, `lint`, `build` und jeder Verhaltenstest blieben grün. Ein
 * Quelltext-Scan sieht es; dieselbe Bauform wie in `launcherEintraege.test.ts`,
 * das `core/shell` auf genau eine Portal-Datei festnagelt.
 */
describe("Release Notes — nur das Portal liest sie", () => {
  const ERLAUBT = join("src", "app", "m", "portal");

  function alleQuelldateien(verzeichnis: string): string[] {
    return readdirSync(verzeichnis).flatMap((eintrag) => {
      const pfad = join(verzeichnis, eintrag);
      if (statSync(pfad).isDirectory()) return alleQuelldateien(pfad);
      return /\.tsx?$/.test(pfad) ? [pfad] : [];
    });
  }

  it("kein Modul außerhalb von `m/portal` importiert `_lib/neuigkeiten`", () => {
    const fremdeVerwender = alleQuelldateien("src")
      .filter((pfad) => !pfad.startsWith(ERLAUBT))
      .filter((pfad) => /_lib\/neuigkeiten/.test(readFileSync(pfad, "utf8")));

    expect(fremdeVerwender).toEqual([]);
  });
});
