import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * QUELLTEXT-SCAN UEBER `_ui/files.css` — und NUR darueber.
 *
 * Was dieser Scan besitzt: die Modulvariablen `--fi-*` (Hell/Dunkel-Paritaet,
 * kein `--ant-*`, kein `prefers-color-scheme`) und die Zusage, dass diese
 * GLOBALE Datei keine Regel gegen antd und keine Media Query traegt.
 *
 * ⚠️ BIS DRK-422 STAND HIER AUCH DIE UMSCHALTUNG TABELLE/KARTENLISTE
 * (`.fi-liste .nurDesktop`/`.nurMobil` samt 767.98px-Abfrage), und dieser Scan
 * besass ihre Form. Sie gehoert jetzt dem gemeinsamen Bauteil
 * (`core/tabelle/schmalkarten.module.css`, bewacht von
 * `core/tabelle/schmalkarten.test.ts`); eine zweite Abfrage hier waere ein
 * zweiter Ort fuer dieselbe Entscheidung — genau die Verdopplung, die das Ticket
 * beseitigt hat. Der Fall „keine Media Query" unten haelt das fest.
 *
 * ABGRENZUNG (Plan §1 Festlegung C): dieser Scan besitzt `_ui/files.css`.
 * `_ui/files-public.css` und ALLE `*.module.css` des Moduls besitzt
 * `files-public-css.test.ts` (T19). Die beiden Globs sind disjunkt und decken
 * zusammen jede CSS-Datei des Moduls ab.
 */
const MODUL_DIR = "src/app/m/files";
/**
 * Die geprueften Dateien als LISTE, obwohl es heute genau eine ist: der Scan
 * muss zuerst zusichern, dass er ueberhaupt etwas gelesen hat. Ein Scan ueber
 * null Dateien ist gruen, ohne etwas zu belegen — und ein Tippfehler im Pfad
 * fiele dann nie auf.
 */
const DATEIEN = [`${MODUL_DIR}/_ui/files.css`];

/**
 * ZWEI SICHTEN AUF DIESELBE DATEI, und die Trennung ist nicht Kosmetik:
 *
 * - `OHNE_KOMMENTARE` traegt die Regeln. `!important` und
 *   `prefers-color-scheme` muessen hier geprueft werden, sonst schlaegt der
 *   Test an der BEGRUENDUNG an — dieses Stylesheet erklaert im Kopf, warum es
 *   bewusst NICHT auf `prefers-color-scheme` selektiert, und ein Scan ueber den
 *   Rohtext wuerde an genau diesem Satz rot. Der naheliegende „Fix" waere dann, die
 *   Begruendung zu loeschen: der Test haette den Kommentar wegoptimiert, den er
 *   an anderer Stelle verlangt.
 * - `ROH` traegt die Kommentare — nur fuer die Zusage, dass ueberhaupt etwas
 *   gelesen wurde.
 */
const ROH = DATEIEN.map((p) => (existsSync(p) ? readFileSync(p, "utf8") : "")).join("\n");
const OHNE_KOMMENTARE = ROH.replace(/\/\*[\s\S]*?\*\//g, "");

/**
 * Die flachen Regelbloecke der Datei, mit Selektor. `[^{}@]` schlieszt
 * At-Preludes aus (sie tragen `@`).
 *
 * OHNE Anker vor dem Selektor: ein `(?:^|[{}])` davor verschluckt die
 * schliessende Klammer des Vorgaengers, und dann findet der naechste Durchlauf
 * seinen Startpunkt nicht mehr — gemessen: von vier Umschaltregeln kamen zwei an,
 * und der ganze Dunkelblock fehlte. Ein Test, der so nur die Haelfte der Datei
 * sieht, ist nicht streng, sondern blind.
 */
const regelnAus = (css: string) =>
  [...css.matchAll(/([^{}@]+?)\s*\{([^{}]*)\}/g)].map((m) => ({
    selektor: m[1].replace(/\s+/g, " ").trim(),
    rumpf: m[2],
  }));

/**
 * Die Regeln AUSSERHALB jedes At-Blocks. Heute ist das die ganze Datei (sie
 * kennt keinen, s. „keine Media Query" unten); die Trennung bleibt, damit ein
 * spaeteres `:root { --fi-… }` in einem At-Block nicht still in die Hell-Menge
 * gezogen wird und die Paritaetspruefung die falschen Mengen vergleicht.
 */
const BASIS = OHNE_KOMMENTARE.replace(/@[a-z-]+[^{]*\{[\s\S]*?\n\}/g, "");
const REGELN_BASIS = regelnAus(BASIS);

/**
 * ALLE Regeln der Datei — unabhaengig davon, in welchem At-Block sie stehen.
 * Nur die At-PRELUDES fallen weg (`@media … {`), die Regeln darin bleiben. Das
 * deckt auch `@supports` und `@layer` ab, ohne sie einzeln zu erraten.
 */
const AT_PRELUDE = /@[a-z-]+[^{;]*\{/g;
const ALLE_REGELN = regelnAus(OHNE_KOMMENTARE.replace(AT_PRELUDE, ""));

const varNamen = (text: string): Set<string> =>
  new Set([...text.matchAll(/(--fi-[a-z0-9-]+)\s*:/g)].map((m) => m[1]));

/** Nur aus den BASISREGELN — Begruendung an `BASIS`. */
const rumpfVon = (pruefe: (selektor: string) => boolean): string =>
  REGELN_BASIS.filter((r) => pruefe(r.selektor))
    .map((r) => r.rumpf)
    .join("\n");

describe("files.css — der Scan greift nicht ins Leere", () => {
  it("liest eine nicht-leere Dateimenge, die `_ui/files.css` enthaelt", () => {
    expect(DATEIEN.length).toBeGreaterThan(0);
    expect(DATEIEN).toContain("src/app/m/files/_ui/files.css");
    for (const pfad of DATEIEN) {
      expect(existsSync(pfad), `${pfad} fehlt`).toBe(true);
    }
    expect(ROH.trim().length).toBeGreaterThan(0);
  });

  it("findet Regelbloecke (sonst ist die Zerlegung kaputt, nicht die Datei leer)", () => {
    expect(REGELN_BASIS.length).toBeGreaterThan(0);
  });

  /**
   * ABZAEHLEN GEGEN DIE DATEI, nicht gegen die eigene Zerlegung: `ALLE_REGELN`
   * traegt die Praefix-Zusage fuer JEDE Regel — eine Zerlegung, die eine Regel
   * uebersieht, macht diese Zusage still enger, ohne rot zu werden. Jede
   * oeffnende Klammer der Datei ist entweder ein At-Prelude oder eine Regel;
   * heute: 2 Klammern − 0 Preludes = 2 Regeln (hell und dunkel).
   */
  it("sieht JEDE Regel der Datei — Klammern minus At-Preludes", () => {
    const klammern = (OHNE_KOMMENTARE.match(/\{/g) ?? []).length;
    const preludes = (OHNE_KOMMENTARE.match(AT_PRELUDE) ?? []).length;
    expect(
      ALLE_REGELN.length,
      "die Zerlegung uebersieht eine Regel — dann gilt die Praefix-Zusage fuer sie nicht",
    ).toBe(klammern - preludes);
  });
});

describe("files.css — keine Umschaltung, keine Regel gegen antd", () => {
  /**
   * ⚠️ KEINE MEDIA QUERY, UND ZWAR GAR KEINE. Die einzige, die hier je stand,
   * war die Umschaltung Tabelle/Kartenliste — seit DRK-422 Sache des Bauteils
   * `core/tabelle` mit SEINER Abfrage. Kaeme hier wieder eine dazu, gaebe es
   * zwei Orte, die ueber dieselbe Sichtbarkeit entscheiden, und der erste Bruch
   * fiele nur an einem davon auf. Komponentenlokale Abfragen gehoeren in ein
   * `*.module.css` (bewacht von `files-public-css.test.ts`).
   */
  it("kennt keine Media Query", () => {
    expect(OHNE_KOMMENTARE).not.toMatch(/@media/);
  });

  /**
   * DIE HANDGEBAUTEN SICHTBARKEITSKLASSEN KOMMEN NICHT ZURUECK — weder hier
   * noch an einer Komponente des Moduls. `.nurDesktop`/`.nurMobil` waren die
   * zweite Haelfte derselben Umschaltung; eine Klasse ohne Regel waere
   * wirkungslos, eine Regel ohne diesen Scan still wieder da.
   */
  it("fuehrt `nurDesktop`/`nurMobil` nirgends im Modul", () => {
    const quellen = readdirSync(MODUL_DIR, { recursive: true, encoding: "utf8" })
      .filter((pfad) => /\.(tsx?|css)$/.test(pfad) && !/\.test\.tsx?$/.test(pfad))
      .map((pfad) => join(MODUL_DIR, pfad));
    expect(quellen.length, "keine Quelldatei im Modul gefunden").toBeGreaterThan(10);
    const treffer = quellen.filter((pfad) =>
      /\bnur(Desktop|Mobil)\b/.test(readFileSync(pfad, "utf8").replace(/\/\*[\s\S]*?\*\//g, "")),
    );
    expect(treffer, "handgebaute Umschaltklassen statt `Kartentabelle`").toEqual([]);
  });

  /**
   * GESCHLOSSENE POSITIVFORM UEBER JEDEN SELEKTOR DER DATEI. Diese Datei ist
   * das EINZIGE globale Stylesheet des Moduls; eine bare `.ant-…`-Regel darin
   * ist der Gleichstand-Fall aus Falle 5, der still verliert.
   *
   * Ueber `ALLE_REGELN`: eine Regel in einem At-Block steht in `REGELN_BASIS`
   * gar nicht.
   */
  it("laesst keinen Selektor ohne eigenen Praefix durch — auch keinen neuen", () => {
    expect(ALLE_REGELN.length).toBeGreaterThan(0);
    for (const regel of ALLE_REGELN) {
      for (const teil of regel.selektor.split(",").map((t) => t.trim())) {
        expect(
          teil,
          `Selektor "${teil}": files.css ist GLOBAL — jede Regel beginnt mit ` +
            `\`.fi-…\` oder \`:root\`. Komponentenlokales CSS gehoert in ein ` +
            `*.module.css neben seine Komponente (Plan §1 Festlegung C); eine bare ` +
            `\`.ant-…\`-Regel hier verliert gegen antd still (Falle 5).`,
        ).toMatch(/^(:root|\.fi-[a-z0-9-]+)/);
      }
    }
  });

  it("kommt ohne `!important` aus", () => {
    expect(OHNE_KOMMENTARE).not.toMatch(/!\s*important/);
  });
});

describe("files.css — Hell/Dunkel", () => {
  const hell = rumpfVon((s) => s.includes(":root") && !s.includes('data-theme="dark"'));
  const dunkel = rumpfVon((s) => s.includes('[data-theme="dark"]'));

  it("deklariert `--fi-*` auf `:root`", () => {
    expect(varNamen(hell).size).toBeGreaterThan(0);
  });

  /**
   * Und zwar auf dem NACKTEN `:root`, nicht nur auf `:root[data-theme="light"]`.
   * Der `hell`-Filter oben akzeptiert jeden Selektor, der `:root` als Teilstring
   * enthaelt — GEMESSEN: das nackte `:root` gestrichen und der Fall blieb gruen.
   * Die Datei begruendet den Rueckfall im Kopf selbst („damit ein Kontext ohne
   * Attribut nicht ohne Farben dasteht"); bewacht war er nicht. Heute setzt
   * `src/app/layout.tsx` `data-theme` immer, der Rueckfall ist also eine Zusage
   * fuer den Kontext, der es nicht tut — genau die Art Zusage, die niemand
   * vermisst, bis sie fehlt.
   */
  it("legt die Hellwerte zusaetzlich auf das nackte `:root`", () => {
    const nackt = REGELN_BASIS.some((r) =>
      r.selektor
        .split(",")
        .map((t) => t.trim())
        .includes(":root"),
    );
    expect(
      nackt,
      "die Hellwerte brauchen zusaetzlich das nackte `:root` (Rueckfall ohne data-theme)",
    ).toBe(true);
  });

  /**
   * Parität JE VARIABLE, nicht „ein Dunkelblock existiert": ein vergessener
   * Wert im Dunkelmodus faellt sonst erst auf, wenn jemand nachts hinsieht.
   */
  it("fuehrt jede `--fi-*`-Variable auch unter `:root[data-theme=\"dark\"]`", () => {
    const hellNamen = [...varNamen(hell)].sort();
    const dunkelNamen = [...varNamen(dunkel)].sort();
    expect(dunkelNamen).toEqual(hellNamen);
  });

  /**
   * Die Suite hat einen UMSCHALTER (Cookie `iuk-theme-pref`, `<html data-theme>`).
   * Auf `prefers-color-scheme` zu selektieren bricht den Fall „System dunkel,
   * Umschalter hell" — und zwar still.
   */
  it("selektiert nirgends auf `prefers-color-scheme`", () => {
    expect(OHNE_KOMMENTARE).not.toMatch(/prefers-color-scheme/);
  });

  /**
   * `--ant-*` werden auf antds Scope-Klasse deklariert, nicht auf `:root`.
   * Eigenes Markup sieht sie nie, und der Fehler ist still: die Haarlinie
   * verschwindet einfach. In dieser Datei stehen deshalb nur `--fi-*`.
   */
  it("verwendet in eigenem Markup keine `--ant-*`-Variablen", () => {
    expect(OHNE_KOMMENTARE).not.toMatch(/var\(\s*--ant-/);
  });
});
