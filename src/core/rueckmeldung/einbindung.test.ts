import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * QUELLTEXT-ZUSICHERUNGEN, WEIL KEIN ANDERES TOR SIE LEISTEN KANN.
 *
 * Diese Datei rendert nichts. Sie hält fünf Entscheidungen fest, die alle
 * gemeinsam haben, dass ihr Bruch STILL ist — `typecheck`, `lint` und `build`
 * bleiben in jedem der fünf Fälle grün:
 *
 * 1. Die Reichweite des schwebenden Knopfes (nur Arbeitsflächen). Wandert die
 *    Insel ins Wurzel-Layout oder in den geteilten Rahmen, schwebt sie auf dem
 *    Kiosk-Dauerdisplay, im Druck und auf jeder anonymen Seite. Das sieht
 *    niemand am Diff einer einzelnen Datei.
 * 2. Falle 6: `konfiguration.ts` und `zustand.ts` dürfen kein `"use client"`
 *    tragen. Bei `konfiguration.ts` bekäme `FullShell` sonst eine
 *    Client-Referenz statt der Adresse — HTTP 500 für jede Arbeitsfläche, und
 *    **Vitest könnte es strukturell nicht sehen** (dort ist `"use client"` ein
 *    wirkungsloser String).
 * 3. Die Insel MUSS `"use client"` tragen — sie liest `localStorage` und Hooks.
 * 4. Falle 18: die Druckregel am schwebenden Knopf. Ohne sie wird aus
 *    `position: fixed` im Druck ein Kasten in Fenstergröße, der ein leeres
 *    Blatt im Vorgabeformat des Druckers erzeugt. Das sieht nur, wer druckt.
 * 5. Die Abschaltung in E2E. Ohne sie stünde der Knopf über den Greifern —
 *    und weil er nach dem ersten Klick verschwindet, mal da und mal nicht. Ein
 *    solcher Lauf wird nicht rot, sondern rennabhängig rot, die teuerste Sorte
 *    (dieselbe Bauform wie `POCKET_ID_API_KEY: ""` daneben).
 */

/**
 * ⚠️ OHNE KOMMENTARE GELESEN, UND DAS IST DER UNTERSCHIED ZWISCHEN EINER
 * ZUSICHERUNG UND EINEM ZUFALL.
 *
 * Diese Datei prüft Quelltext auf Zeichenketten. Die Dateien, die sie prüft,
 * sind dicht kommentiert — und die Kommentare handeln naturgemäß von genau den
 * Wörtern, um die es geht („trägt kein `use client`", „nicht `NEXT_PUBLIC_*`",
 * „hier hängt der Rückmeldeknopf"). Ungefiltert misst der Test damit die
 * Dokumentation statt des Codes, und zwar in BEIDE Richtungen:
 *
 * - Eine Verbotszusicherung wird rot, obwohl der Code sauber ist.
 * - Schlimmer: eine Gebotszusicherung wird GRÜN, obwohl der Code die Sache gar
 *   nicht tut. `FullShell` enthielte das Wort „Rückmeldung" auch dann noch,
 *   wenn die Einbindung entfernt und nur der erklärende Absatz stehen bliebe.
 *
 * Dieselbe Bauform wie `OHNE_KOMMENTARE` in `core/shell/shell-css.test.ts`.
 */
function ohneKommentare(quelle: string): string {
  return (
    quelle
      .replace(/\/\*[\s\S]*?\*\//g, "")
      // Nur Zeilenkommentare am Zeilenanfang: ein `//` mitten in der Zeile
      // könnte in `https://…` stehen.
      .replace(/^[ \t]*\/\/.*$/gm, "")
  );
}

const lies = (pfad: string) => ohneKommentare(readFileSync(pfad, "utf8"));

/** Alle Quelldateien unter `src/`, ohne Tests — dieselbe Auswahl wie `icons.test.ts`. */
function sammleQuellen(verzeichnis: string, treffer: string[] = []): string[] {
  for (const eintrag of readdirSync(verzeichnis)) {
    const pfad = join(verzeichnis, eintrag);
    if (statSync(pfad).isDirectory()) {
      sammleQuellen(pfad, treffer);
      continue;
    }
    if (!/\.tsx?$/.test(eintrag)) continue;
    if (/\.test\.tsx?$/.test(eintrag)) continue;
    treffer.push(pfad);
  }
  return treffer;
}

describe("Reichweite des schwebenden Knopfes", () => {
  it("hängt in FullShell", () => {
    const quelle = lies("src/core/shell/FullShell.tsx");
    expect(quelle).toContain("RueckmeldungKnopf");
    expect(quelle).toContain("rueckmeldungUrl");
  });

  /**
   * ⚠️ DER SCAN LÄUFT ÜBER DAS GANZE `src/` UND NICHT ÜBER EINE LISTE VON VIER
   * DATEIEN — das ist der Unterschied zur abgelösten Fassung dieses Tests, und
   * er ist bezahlt: eine Liste deckt die Stellen ab, an die man DENKT. Eine
   * fünfte Shell, ein Modul-Layout, ein Druckrahmen, der die Insel „auch noch"
   * einhängt — all das käme durch. Hier ist die Zusage absolut: genau EIN
   * Aufrufer, und der heißt `FullShell`.
   */
  it("hat genau einen Aufrufer im ganzen Repo", () => {
    const aufrufer = sammleQuellen("src")
      .filter((pfad) => !pfad.startsWith(join("src", "core", "rueckmeldung")))
      .filter((pfad) => lies(pfad).includes("RueckmeldungKnopf"));
    expect(aufrufer).toEqual([join("src", "core", "shell", "FullShell.tsx")]);
  });

  /**
   * ⚠️ DER MENÜEINTRAG IST EINE ANDERE REICHWEITE, UND DAS STEHT HIER, DAMIT ES
   * NICHT WIE EIN WIDERSPRUCH AUSSIEHT. Er hängt in `SuiteHeader`, den BEIDE
   * Shells rufen — er steht also auch auf den schmalen Ansichten (`qr`,
   * `beta`). Das ist gewollt: ein Eintrag in einem Menü, das man aufklappen
   * muss, steht niemandem im Weg, ein schwebender Knopf schon. Er hängt dort
   * zusätzlich an `angemeldet`, weshalb ihn auf einer anonymen Fläche trotzdem
   * niemand sieht.
   */
  it("der Menüeintrag hängt in SuiteHeader, nicht im Knopf", () => {
    expect(lies("src/core/shell/SuiteHeader.tsx")).toContain("rueckmeldungUrl");
    expect(lies("src/core/shell/SuiteNav.tsx")).toContain("feedbackHref");
  });

  it.each([
    ["das Wurzel-Layout", "src/app/layout.tsx"],
    ["die schmale Shell", "src/core/shell/MinimalShell.tsx"],
    ["die Kiosk-Shell", "src/core/shell/KioskShell.tsx"],
    ["den geteilten Rahmen", "src/core/shell/SuiteRahmen.tsx"],
  ])("lädt den Knopf NICHT über %s", (_name, pfad) => {
    expect(lies(pfad)).not.toContain("Rueckmeldung");
  });
});

describe("Die Server-/Client-Grenze", () => {
  it.each(["konfiguration.ts", "zustand.ts"])(
    "hält %s frei von `use client` (Falle 6)",
    (datei) => {
      expect(lies(`src/core/rueckmeldung/${datei}`)).not.toContain('"use client"');
    },
  );

  it("markiert die Insel als Client-Komponente", () => {
    // Am ROHTEXT: die Direktive muss die erste Anweisung der Datei sein, und
    // genau das prüft diese Zusicherung mit.
    const roh = readFileSync("src/core/rueckmeldung/RueckmeldungKnopf.tsx", "utf8");
    expect(roh.trimStart()).toMatch(/^"use client";/);
  });

  it("belegt die Adresse NICHT mit NEXT_PUBLIC_ — sonst stünde sie im Bundle", () => {
    expect(lies("src/core/rueckmeldung/konfiguration.ts")).not.toContain("NEXT_PUBLIC");
  });
});

describe("Der Knopf auf dem Papier (Falle 18)", () => {
  const CSS = ohneKommentare(readFileSync("src/core/rueckmeldung/rueckmeldung.module.css", "utf8"));

  /**
   * ⚠️ DIE WIRKUNG SIEHT NUR EIN DRUCKER, DIE REGEL SIEHT DIESER TEST. Ein
   * `position: fixed` wird im Druckkontext zu einem Kasten in Fenstergröße; er
   * liegt ausserhalb jeder benannten `@page` und erzeugt ein leeres Blatt im
   * Vorgabeformat des Druckers. Gemessen ist das am geschlossenen
   * Navigationsschub (`shell.module.css`), und `typecheck`, `lint`, `build` und
   * jsdom sehen davon nichts — jsdom rechnet keine Seitenaufteilung.
   */
  it("versteckt den schwebenden Knopf im Druck", () => {
    expect(CSS).toMatch(/@media print\s*\{[\s\S]*\.schweber\s*\{[\s\S]*display:\s*none/);
  });

  it("ist überhaupt `position: fixed` — sonst ginge die Regel oben ins Leere", () => {
    expect(CSS).toMatch(/\.schweber\s*\{[\s\S]*position:\s*fixed/);
  });

  /**
   * ⚠️ FALLE 2: antd deklariert seine `--ant-*`-Variablen auf seiner
   * Scope-Klasse, nicht auf `:root`. Eigenes Markup sieht sie nicht, und der
   * Fehler ist still — eine nicht auflösbare CSS-Variable fällt auf
   * `transparent` zurück und ist gültiges CSS. Deshalb trägt dieses Stylesheet
   * keinen Farbwert: was hier Farbe hat, hat sie als antd-`Button`.
   */
  it("liest keine --ant-*-Variable", () => {
    expect(CSS).not.toContain("--ant-");
  });
});

describe("Abschaltung in E2E", () => {
  it("setzt SUITE_RUECKMELDUNG_URL leer", () => {
    expect(lies("playwright.config.ts")).toMatch(/SUITE_RUECKMELDUNG_URL:\s*""/);
  });
});
