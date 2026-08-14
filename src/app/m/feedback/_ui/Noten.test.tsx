// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NOTEN_DUNKEL, NOTEN_HELL, NOTEN_WORT, formatiereNote } from "../_lib/noten";
import { T } from "./typo";
import {
  Altbestandsfussnote,
  Notenlegende,
  Notenpille,
  Notenplakette,
  Notenspur,
} from "./Noten";

/**
 * DIE WIEDERKEHRENDEN ANZEIGEN AN EINER STELLE (Entwurf §4.7, §4.8, §4.10–§4.12,
 * §4.14). Was hier geprueft wird, sind nicht Geschmacksfragen, sondern vier
 * Zusagen, die still brechen:
 *
 * 1. Eine Note haengt NIE allein an Farbe. Ziffer, Wort und Position tragen sie
 *    auch in Graustufen und bei Deuteranopie (§4.14).
 * 2. Es gibt EINE Schwellendefinition — `ampelStufe` in `_lib/noten.ts`. Ein
 *    zweites `Math.round` irgendwo in `_ui` faellt niemandem auf, bis zwei
 *    Anzeigen desselben Werts verschiedene Farben zeigen.
 * 3. Eine Toenung traegt keinen Text: die Notenfarbe auf ihrer eigenen Toenung
 *    erreicht nur ~2:1. Textfuehrende Notenflaechen sind vollgesaettigt (§4.11).
 * 4. `stars` (Skala 1–5) wird NICHT auf die Sechser-Rampe abgetastet (§4.12) —
 *    sonst liegen in derselben Spalte zwei Bedeutungen in derselben Farbe.
 *
 * Was jsdom NICHT kann: CSS anwenden. Wo eine Zusage nur im Stylesheet lebt
 * (der Spiegel der Palette, das Rot-Budget, die `--ant-*`-Sperre), steht unten
 * eine Quelltext-Assertion — der einzige Weg, sie festzunageln.
 */

/** Ueber `process.cwd()`: in jsdom ist `import.meta.url` eine http-URL. */
const UI = join(process.cwd(), "src/app/m/feedback/_ui");
const quelle = (datei: string) => readFileSync(join(UI, datei), "utf8");

/**
 * Kommentare raus, BEVOR eine Quelltext-Assertion greift: die Begruendung DARF
 * `#c8000f` und `--ant-*` nennen — der Code nicht. Ohne diesen Schritt schlaegt
 * die eigene Erklaerung den eigenen Test.
 */
const ohneKommentare = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const CSS = quelle("feedback.css");
const CSS_CODE = ohneKommentare(CSS);
const NOTEN_TSX = ohneKommentare(quelle("Noten.tsx"));
const TYPO_TS = ohneKommentare(quelle("typo.ts"));
/**
 * ALLE ausgelieferten Dateien in `_ui/**`, nicht eine Aufzaehlung von Hand: die
 * Farb-Klausel und die `--ant-*`-Sperre sollen auch fuer die Bauteile gelten,
 * die die naechsten Aufgaben hier ablegen. Testdateien sind ausgenommen — sie
 * MUESSEN die verbotene Zeichenfolge nennen, um sie zu verbieten.
 *
 * REKURSIV, und das ist der ganze Punkt: die erste Fassung las nur die oberste
 * Ebene und verwarf Unterverzeichnisse STILL. Eine spaetere Datei
 * `_ui/charts/Foo.tsx` haette sich damit beiden Sperren entzogen, ohne dass
 * etwas anschlaegt — und „still" ist der einzige Grund, aus dem diese
 * Assertionen ueberhaupt existieren. Zurueck kommen Pfade RELATIV zu `wurzel`,
 * damit `quelle()` sie weiter direkt lesen kann.
 */
function dateienRekursiv(wurzel: string, unter = ""): string[] {
  return readdirSync(join(wurzel, unter), { withFileTypes: true }).flatMap((eintrag) => {
    const pfad = unter ? join(unter, eintrag.name) : eintrag.name;
    if (eintrag.isDirectory()) return dateienRekursiv(wurzel, pfad);
    if (!eintrag.isFile() || eintrag.name.includes(".test.")) return [];
    return [pfad];
  });
}

const UI_DATEIEN = dateienRekursiv(UI);

function zeichne(element: ReactElement): HTMLElement {
  const wirt = document.createElement("div");
  wirt.innerHTML = renderToStaticMarkup(element);
  return wirt;
}

/** Alle Elemente inkl. Wurzelkindern — fuer Invarianten ueber den ganzen Baum. */
const alle = (wirt: HTMLElement) => Array.from(wirt.querySelectorAll<HTMLElement>("*"));

/** Das `style`-Attribut als Rohtext: jsdom parst `var(--x)` in Kurzschreibweisen nicht. */
const stil = (el: Element) => el.getAttribute("style") ?? "";

/** Die erste Rasterzeile — Legende und Spur muessen sie teilen. */
const rasterzeile = (wirt: HTMLElement) =>
  alle(wirt).find((el) => stil(el).includes("grid-template-columns"))!;

/** Der Stil der ersten Rasterzeile. */
const raster = (wirt: HTMLElement) => stil(rasterzeile(wirt));

/**
 * Die sechs Rasterfelder in DOKUMENTREIHENFOLGE — der Anker jeder
 * positionsbezogenen Farbzusage. Eine Pruefung per Mengenzugehoerigkeit
 * (`innerHTML` enthaelt `var(--note-1)` … `var(--note-6)`) besteht auch eine
 * Permutation der Palette, also auch die vollstaendig invertierte Ampel — und
 * eine Ampel, die hohe Noten gruen faerbt, ist hier ein Sachfehler. Deshalb
 * wird ueber `children` indiziert (nicht gefiltert): faellt eine Farbe ganz
 * weg, schrumpft eine gefilterte Liste still, eine indizierte nicht.
 */
const felder = (wirt: HTMLElement) => Array.from(rasterzeile(wirt).children) as HTMLElement[];

/** Den Block eines Selektors aus dem Stylesheet holen. */
function cssBlock(selektor: string): string {
  const treffer = CSS_CODE.match(
    new RegExp(`${selektor.replace(/[[\]().*+?^$|\\{}]/g, "\\$&")}\\s*\\{([^}]*)\\}`),
  );
  if (!treffer) throw new Error(`Selektor fehlt im Stylesheet: ${selektor}`);
  return treffer[1];
}

function cssVariable(block: string, name: string): string {
  const treffer = block.match(new RegExp(`${name}\\s*:\\s*([^;]+);`));
  if (!treffer) throw new Error(`Variable fehlt: ${name}`);
  return treffer[1].trim();
}

describe("Notenpille — drei Kanaele, nie nur Farbe", () => {
  it("traegt Ziffer UND Wort UND Farbe", () => {
    const wirt = zeichne(<Notenpille note={2.4} />);
    expect(wirt.textContent).toContain("2,4");
    expect(wirt.textContent).toContain("gut");
    expect(wirt.innerHTML).toContain("var(--note-2)");
  });

  it("nennt im aria-label die Richtung der Skala (1 ist die beste Note)", () => {
    const wirt = zeichne(<Notenpille note={2.4} />);
    const pille = wirt.querySelector('[role="img"]');
    expect(pille?.getAttribute("aria-label")).toBe(
      "Durchschnitt 2,4 von 6 — gut. 1 ist die beste Note, 6 die schlechteste.",
    );
  });

  // Die Schwellen kommen aus `ampelStufe` (§4.11). Geprueft werden die
  // GRENZWERTE, weil genau dort ein selbstgebautes `Math.floor` oder ein
  // `>=`-Dreher unentdeckt bliebe.
  it.each([
    [1.0, 1],
    [1.49, 1],
    [1.5, 2],
    [2.49, 2],
    [2.5, 3],
    [3.49, 3],
    [3.5, 4],
    [4.49, 4],
    [4.5, 5],
    [5.49, 5],
    [5.5, 6],
    [6.0, 6],
  ])("faerbt %s als Note %i", (durchschnitt, stufe) => {
    const wirt = zeichne(<Notenpille note={durchschnitt} />);
    expect(wirt.innerHTML).toContain(`var(--note-${stufe})`);
    expect(wirt.textContent).toContain(NOTEN_WORT[stufe - 1]);
    // Der ANGEZEIGTE Wert bleibt exakt — gerundet wird nur die Farbe.
    expect(wirt.textContent).toContain(formatiereNote(durchschnitt));
  });

  it("zeigt bei `null` ein „—“ und KEINE Pille", () => {
    const wirt = zeichne(<Notenpille note={null} />);
    expect(wirt.textContent).toBe("—");
    expect(wirt.innerHTML).not.toContain("var(--note-");
  });

  it("setzt die Ziffer auf die VOLLGESAETTIGTE Farbe, nie auf eine Toenung", () => {
    const wirt = zeichne(<Notenpille note={2.4} />);
    const traeger = alle(wirt).find((el) => el.textContent === "2,4");
    expect(stil(traeger!)).toContain("background:var(--note-2)");
    expect(stil(traeger!)).not.toContain("--note-tint");
    expect(stil(traeger!)).toContain("color:var(--note-ink)");
  });
});

describe("Notenpille — `stars` (Skala 1–5) bleibt neutral", () => {
  it("stellt eine 5er-Note neutral dar und nennt den Altbestand", () => {
    const wirt = zeichne(<Notenpille note={4.2} scale={5} />);
    expect(wirt.textContent).toContain("Ø 4,2 von 5");
    expect(wirt.textContent).toContain("Altbestand-Skala");
  });

  it("tastet sie NICHT auf die Sechser-Rampe ab", () => {
    const wirt = zeichne(<Notenpille note={4.2} scale={5} />);
    // Keine Notenfarbe und kein Notenwort: 4,2 von 5 ist nicht „ausreichend“.
    expect(wirt.innerHTML).not.toContain("var(--note-");
    for (const wort of NOTEN_WORT) expect(wirt.textContent).not.toContain(wort);
    expect(wirt.innerHTML).toContain("var(--fb-fill)");
  });
});

describe("Notenspur — nur wo eine Verteilung existiert", () => {
  const VERTEILUNG = [1, 4, 3, 0, 0, 0] as const;

  // Die Keil-Nummer je Position ist der Anker: sie bindet die
  // Dokumentreihenfolge an die Notenziffer. Erst dadurch heisst „das dritte
  // Feld" auch wirklich „Note 3".
  it("zeichnet sechs Zellen im Tonwertkeil, aufsteigend von links", () => {
    const wirt = zeichne(<Notenspur verteilung={VERTEILUNG} />);
    const zellen = felder(wirt);
    expect(zellen).toHaveLength(6);
    expect(zellen.map((el) => stil(el).match(/background:var\(--fb-keil-(\d)\)/)?.[1])).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
    ]);
  });

  it("faerbt die Saeule in Zelle n mit GENAU der Farbe der Note n", () => {
    const wirt = zeichne(<Notenspur verteilung={[1, 4, 3, 2, 1, 1]} />);
    felder(wirt).forEach((zelle, i) => {
      // Selbst verankert: `felder` nimmt die ERSTE Rasterzeile, und die grosse
      // Spur hat drei. Ohne diese Zeile wuerde ein Umsortieren im Markup nicht
      // die Farbzusage melden, sondern eine raetselhafte Folgemeldung.
      expect(stil(zelle)).toContain(`background:var(--fb-keil-${i + 1})`);
      const saeule = zelle.querySelector("span")!;
      // Kein `var(--note-`-Praefix: `--note-tint-n` beginnt genauso. Positions-
      // treu, damit eine invertierte oder vertauschte Palette auffaellt.
      expect(stil(saeule)).toContain(`background:var(--note-${i + 1})`);
    });
  });

  it("macht die Saeulenhoehe zum Anteil und laesst leere Noten leer", () => {
    const wirt = zeichne(<Notenspur verteilung={VERTEILUNG} />);
    // Zellhoehe kompakt 24, Gesamt 8: 1→3px, 4→12px, 3→9px; Note 4 bis 6 leer.
    const erwartet = ["3", "12", "9", null, null, null];
    felder(wirt).forEach((zelle, i) => {
      expect(stil(zelle)).toContain(`background:var(--fb-keil-${i + 1})`);
      const saeule = zelle.querySelector<HTMLElement>("span");
      if (erwartet[i] === null) {
        expect(saeule).toBeNull();
        return;
      }
      expect(stil(saeule!)).toContain(`background:var(--note-${i + 1})`);
      expect(stil(saeule!).match(/height:(\d+)px/)?.[1]).toBe(erwartet[i]);
    });
  });

  it("gibt einer einzigen Rueckmeldung mindestens 2px", () => {
    // 1 von 50 waere 0,48px — gerundet 0 und damit unsichtbar.
    const wirt = zeichne(<Notenspur verteilung={[1, 49, 0, 0, 0, 0]} />);
    expect(stil(felder(wirt)[0].querySelector("span")!)).toContain("height:2px");
  });

  it("traegt EIN vollstaendiges aria-label, damit nichts an Hoehe oder Farbe haengt", () => {
    const wirt = zeichne(<Notenspur verteilung={VERTEILUNG} />);
    const spur = wirt.querySelector('[role="img"]');
    expect(spur?.getAttribute("aria-label")).toBe(
      "Notenverteilung: einmal Note 1, viermal Note 2, dreimal Note 3, keine Note 4 bis 6. " +
        "Durchschnitt 2,3, gut.",
    );
    // Genau eines — sonst buchstabiert der Screenreader sechs Zellen einzeln.
    expect(wirt.innerHTML.match(/aria-label/g)).toHaveLength(1);
  });

  it("laesst den Durchschnittssatz weg, solange nichts eingegangen ist", () => {
    const wirt = zeichne(<Notenspur verteilung={[0, 0, 0, 0, 0, 0]} />);
    expect(wirt.querySelector('[role="img"]')?.getAttribute("aria-label")).toBe(
      "Notenverteilung: keine Note 1 bis 6.",
    );
  });

  it("zeigt gross die Notenziffern und die Anzahl je Note, `0` als „·“", () => {
    const wirt = zeichne(<Notenspur verteilung={VERTEILUNG} groesse="gross" />);
    expect(wirt.textContent).toContain("123456");
    expect(wirt.textContent).toContain("143···");
  });
});

describe("Notenlegende", () => {
  it("zeigt sechs Segmente in Palettenreihenfolge und die sechs Notenwoerter", () => {
    const wirt = zeichne(<Notenlegende />);
    const segmente = felder(wirt);
    expect(segmente).toHaveLength(6);
    // Positionsbezogen, nicht als Menge: die Legende erklaert die Spur darunter.
    // Steht auf Platz 1 die Farbe der Note 6, erklaert sie das Gegenteil.
    segmente.forEach((el, i) => {
      expect(stil(el)).toContain(`background:var(--note-${i + 1})`);
    });
    // Und die Woerter in derselben Reihenfolge — sonst sitzt „sehr gut" ueber
    // der Spalte der Note 6.
    const woerter = Array.from(wirt.querySelectorAll(".fb-legende-woerter span"));
    expect(woerter.map((el) => el.textContent)).toEqual([...NOTEN_WORT]);
  });

  /**
   * Geschaltet wird an der Breite der eigenen Spalte, nicht an der des Fensters:
   * die Legendenspalte der Auswertung misst 336px, gleich wie breit der Schirm
   * ist — die sechs Woerter (466px) passten dort auch bei 1280 nicht und liefen
   * seitlich heraus. Deshalb `@container` statt `@media`, und deshalb ist die
   * Schmalvariante die Vorgabe statt der Sonderfall.
   */
  it("haelt die zwei Ankerwoerter bereit und schaltet am Container um", () => {
    const wirt = zeichne(<Notenlegende />);
    expect(wirt.textContent).toContain("1 sehr gut");
    expect(wirt.textContent).toContain("6 ungenügend");
    // Umgeschaltet wird in CSS — inline `display` wuerde die Klasse schlagen.
    expect(wirt.innerHTML).toContain("fb-legende-woerter");
    expect(wirt.innerHTML).toContain("fb-legende-anker");
    expect(wirt.innerHTML).toContain("fb-legende-wirt");
    expect(CSS_CODE).toMatch(/@container\s*\(min-width:\s*560px\)/);
    // Ohne `container-type` am Wirt greift die Abfrage nie — die Regel stuende
    // da und die Wortzeile bliebe fuer immer verborgen.
    expect(CSS_CODE).toMatch(/\.fb-legende-wirt\s*\{[^}]*container-type:\s*inline-size/);
    // `minmax(0, 1fr)`, nicht `1fr`: die auto-Untergrenze der Spalten ist der
    // Grund, aus dem die Zeile ueberhaupt herauslaufen konnte.
    expect(CSS_CODE).toMatch(/grid-template-columns:\s*repeat\(6,\s*minmax\(0,\s*1fr\)\)/);
    // Praezise auf die CSS-Eigenschaft `display:` pruefen, nicht per blossem
    // Teilstring: seit `T.kicker` die Display-Familie der Suite traegt, steht
    // in JEDEM Inline-Style dieses Elements `font-family:var(--font-display)`
    // — ein reiner `toContain("display")` schluege deshalb IMMER an, auch ohne
    // die verbotene Eigenschaft. Das Wort "display" bleibt Teil des
    // Variablennamens, nicht der Eigenschaft; die Zusicherung gilt unveraendert.
    expect(stil(wirt.querySelector(".fb-legende-woerter")!)).not.toMatch(/(?<![\w-])display\s*:/);
  });

  // §4.11 verlangt „das identische 6-Spalten-Raster wie die Spuren darunter" —
  // und die eine Stelle, an der eine Legende steht (die Auswertung, §3.2), zeigt
  // GROSSE Spuren. Faellt der Abstand auseinander, sitzen Wort und Saeule nicht
  // mehr in derselben Spalte, und die Legende erklaert die falsche Farbe.
  it("teilt Raster und Abstand mit der Spur darunter", () => {
    const legende = raster(zeichne(<Notenlegende groesse="gross" />));
    const spur = raster(zeichne(<Notenspur verteilung={[1, 4, 3, 0, 0, 0]} groesse="gross" />));
    expect(legende).toContain("grid-template-columns:repeat(6, 1fr)");
    expect(legende).toContain("gap:4px");
    expect(spur).toContain("grid-template-columns:repeat(6, 1fr)");
    expect(spur).toContain("gap:4px");
    // Kompakt bleibt kompakt — 2 statt 4.
    expect(raster(zeichne(<Notenlegende />))).toContain("gap:2px");
    expect(raster(zeichne(<Notenspur verteilung={[1, 0, 0, 0, 0, 0]} />))).toContain("gap:2px");
  });

  it("traegt kein aria-label — die Woerter stehen als Text da", () => {
    expect(zeichne(<Notenlegende />).innerHTML).not.toContain("aria-label");
  });
});

describe("Notenplakette", () => {
  it("traegt Ziffer, Wort und die Herkunft des Mittelwerts", () => {
    const wirt = zeichne(<Notenplakette note={2.4} fragen={8} />);
    expect(wirt.textContent).toContain("2,4");
    expect(wirt.textContent).toContain("gut");
    expect(wirt.textContent).toContain("Ø aus 8 Fragen");
  });

  it("liegt vollgesaettigt unter der Ziffer, nie auf einer Toenung", () => {
    const wirt = zeichne(<Notenplakette note={2.4} />);
    const traeger = alle(wirt).find((el) => el.textContent === "2,4")!;
    expect(stil(traeger)).toContain("background:var(--note-2)");
    expect(stil(traeger)).toContain("color:var(--note-ink)");
    expect(stil(traeger)).not.toContain("--note-tint");
    // 88×64, Radius 8 (§3.2).
    expect(stil(traeger)).toContain("width:88px");
    expect(stil(traeger)).toContain("height:64px");
    expect(stil(traeger)).toContain("border-radius:8px");
  });

  it("zeigt ohne Note ein „—“ und keine Flaeche", () => {
    const wirt = zeichne(<Notenplakette note={null} />);
    expect(wirt.textContent).toBe("—");
    expect(wirt.innerHTML).not.toContain("var(--note-");
  });
});

describe("Invariante: eine Toenung traegt keinen Text", () => {
  it("gilt fuer jedes Bauteil", () => {
    const baeume = [
      <Notenpille key="p" note={2.4} />,
      <Notenpille key="s" note={4.2} scale={5} />,
      <Notenspur key="k" verteilung={[1, 4, 3, 0, 0, 0]} />,
      <Notenspur key="g" verteilung={[1, 4, 3, 2, 1, 1]} groesse="gross" />,
      <Notenlegende key="l" />,
      <Notenplakette key="b" note={2.4} fragen={8} />,
    ].map(zeichne);
    for (const wirt of baeume) {
      for (const el of alle(wirt)) {
        if ((el.textContent ?? "").trim() === "") continue;
        expect(stil(el)).not.toContain("--note-tint");
      }
    }
  });
});

describe("Fussnote zur Alt-Skala (§4.12)", () => {
  it("nennt Herkunft UND Folge wortgenau", () => {
    const wirt = zeichne(<Altbestandsfussnote />);
    expect(wirt.textContent).toBe(
      "enthält Altbestands-Fragen (Skala 1–5) — nicht in den Durchschnitt gerechnet",
    );
  });

  it("ist eine Herkunftsangabe in T.meta, kein Warnton", () => {
    const wirt = zeichne(<Altbestandsfussnote />);
    const satz = alle(wirt)[0];
    expect(stil(satz)).toContain(`font-size:${T.meta.fontSize}px`);
    expect(stil(satz)).toContain("color:var(--fb-muted)");
    // Keine Notenfarbe: die Fussnote bewertet nicht.
    expect(wirt.innerHTML).not.toContain("var(--note-");
  });
});

describe("Quelltext-Assertionen — was jsdom nicht sehen kann", () => {
  /**
   * Der Riegel gegen das stille Loch: ohne Rekursion entzieht sich eine Datei in
   * einem Unterverzeichnis der Farb-Klausel UND der `--ant-*`-Sperre. `_ui/` hat
   * heute keine Unterverzeichnisse — „die Tests sind gruen" ist hier also kein
   * Beleg, deshalb ein echter Baum in einem Wegwerf-Verzeichnis.
   */
  it("sammelt `_ui/**` rekursiv — ein Unterverzeichnis entzieht sich nicht", () => {
    const wurzel = mkdtempSync(join(tmpdir(), "fb-ui-"));
    try {
      mkdirSync(join(wurzel, "charts"));
      writeFileSync(join(wurzel, "Oben.tsx"), "x");
      writeFileSync(join(wurzel, "charts", "Foo.tsx"), "x");
      writeFileSync(join(wurzel, "charts", "Foo.test.tsx"), "x");
      expect(dateienRekursiv(wurzel).sort()).toEqual(["Oben.tsx", join("charts", "Foo.tsx")]);
    } finally {
      rmSync(wurzel, { recursive: true, force: true });
    }
  });

  it("nennt in `_ui/**` nirgends `#c8000f` (Farb-Klausel)", () => {
    for (const datei of UI_DATEIEN) {
      expect(ohneKommentare(quelle(datei)).toLowerCase()).not.toContain("#c8000f");
    }
  });

  it("verwendet in eigenem Markup KEINE `--ant-*`-Variable", () => {
    // antd deklariert sie auf seiner Scope-Klasse, nicht auf `:root` — eigenes
    // Markup sieht sie nie, und der Fehler ist still.
    for (const datei of UI_DATEIEN) {
      expect(ohneKommentare(quelle(datei))).not.toMatch(/--ant-/);
    }
  });

  it("haelt die Bauteile server-sicher: kein `use client`, kein antd", () => {
    expect(NOTEN_TSX).not.toContain("use client");
    expect(NOTEN_TSX).not.toMatch(/from ["']antd/);
  });

  it("holt Schwellen und Palette ausschliesslich aus `_lib/noten.ts`", () => {
    expect(NOTEN_TSX).toMatch(/import \{[^}]*ampelStufe[^}]*\} from "\.\.\/_lib\/noten"/);
    // Keine zweite Rundungsregel und keine zweite Palette in `_ui`.
    expect(NOTEN_TSX).not.toMatch(/Math\.round|Math\.floor|Math\.ceil/);
    expect(NOTEN_TSX).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(TYPO_TS).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("wird im `(admin)`-Layout eingebunden — sonst fehlen alle Variablen", () => {
    const layout = readFileSync(
      join(process.cwd(), "src/app/m/feedback/(admin)/layout.tsx"),
      "utf8",
    );
    expect(layout).toContain('import "../_ui/feedback.css"');
  });
});

describe("feedback.css — der Spiegel gegen TypeScript", () => {
  const hell = cssBlock(':root[data-theme="light"]');
  const dunkel = cssBlock(':root[data-theme="dark"]');

  it("spiegelt die Palette wortgleich (eine Definition, zwei Zugriffswege)", () => {
    for (let n = 1; n <= 6; n += 1) {
      expect(cssVariable(hell, `--note-${n}`).toUpperCase()).toBe(NOTEN_HELL[n - 1].toUpperCase());
      expect(cssVariable(dunkel, `--note-${n}`).toUpperCase()).toBe(
        NOTEN_DUNKEL[n - 1].toUpperCase(),
      );
    }
    expect(cssVariable(hell, "--note-ink").toUpperCase()).toBe("#FFFFFF");
    expect(cssVariable(dunkel, "--note-ink").toUpperCase()).toBe("#101214");
  });

  it("traegt die sieben `--fb-*`-Rollen in beiden Modi", () => {
    const hellWerte = {
      "--fb-ink": "#1a1d20",
      "--fb-muted": "#5b6570",
      "--fb-line": "#d9dde1",
      "--fb-split": "#e8ebee",
      "--fb-card": "#ffffff",
      "--fb-tint": "#f2f4f5",
      "--fb-fill": "#e6e9eb",
    };
    const dunkelWerte = {
      "--fb-ink": "rgba(255, 255, 255, 0.88)",
      "--fb-muted": "rgba(255, 255, 255, 0.55)",
      "--fb-line": "#303030",
      "--fb-split": "#262626",
      "--fb-card": "#141414",
      "--fb-tint": "#1e1e1e",
      "--fb-fill": "#2a2a2a",
    };
    const knapp = (wert: string) => wert.replace(/\s+/g, "").toLowerCase();
    for (const [name, wert] of Object.entries(hellWerte)) {
      expect(knapp(cssVariable(hell, name))).toBe(knapp(wert));
    }
    for (const [name, wert] of Object.entries(dunkelWerte)) {
      expect(knapp(cssVariable(dunkel, name))).toBe(knapp(wert));
    }
  });

  it("haelt die Toenungen vorberechnet bereit (kein `color-mix`, druckfest)", () => {
    const hellToenung = ["#E6F0EB", "#EAEFE5", "#F0ECE1", "#F2E9E1", "#F2E6E2", "#F0E3E4"];
    const dunkelToenung = ["#2D3833", "#2F3627", "#383019", "#3B2B1E", "#3B2620", "#3A2124"];
    for (let n = 1; n <= 6; n += 1) {
      expect(cssVariable(hell, `--note-tint-${n}`).toUpperCase()).toBe(hellToenung[n - 1]);
      expect(cssVariable(dunkel, `--note-tint-${n}`).toUpperCase()).toBe(dunkelToenung[n - 1]);
    }
    expect(CSS_CODE).not.toContain("color-mix");
  });

  it("dunkelt den achromatischen Tonwertkeil nach rechts", () => {
    const hellKeil = ["#f5f6f7", "#eef0f2", "#e8ebed", "#e2e5e9", "#dcdfe4", "#d6dae0"];
    const dunkelKeil = ["#1d1e20", "#232427", "#292a2e", "#2f3034", "#35363b", "#3b3c42"];
    for (let n = 1; n <= 6; n += 1) {
      expect(cssVariable(hell, `--fb-keil-${n}`).toLowerCase()).toBe(hellKeil[n - 1]);
      expect(cssVariable(dunkel, `--fb-keil-${n}`).toLowerCase()).toBe(dunkelKeil[n - 1]);
    }
  });

  it("ersetzt `outline: none` nie ohne Ring (§4.8)", () => {
    expect(CSS_CODE).toContain(":focus-visible");
    expect(CSS_CODE).toContain("outline: 2px solid var(--fb-ink)");
    expect(CSS_CODE).not.toMatch(/outline:\s*none/);
  });
});

describe("typo.ts — sechs Rollen, keine Ad-hoc-Groesse", () => {
  /**
   * VORMALS SIEBEN, MIT `h1` (Aufgabe 11, Navigation/Dichte hat sie entfernt).
   * `h1` bediente ausschlieszlich die eigenen `<h1>`-Ueberschriften der
   * Admin-Seiten; alle fuenf sind seither `core/shell/Seitenkopf`, der seinen
   * Titel selbst traegt (`SCHRIFT.titel`, ungekuerzt) und diese Datei dafuer
   * nicht mehr liest. Sechs Rollen bedienen weiterhin echte, im Modul lebende
   * Anwender — bringt jemand eine `h1`-Rolle zurueck, gehoert auch wieder ein
   * Anwender dazu, sonst waere es dieselbe Ad-hoc-Groesze, die dieser Test
   * verhindern soll.
   */
  it("bringt genau die sechs Rollen des Entwurfs", () => {
    expect(Object.keys(T)).toEqual(["kicker", "meta", "body", "lead", "h2", "zahl"]);
  });

  it("haelt Groesse und Gewicht der Leiter", () => {
    expect(T.kicker.fontSize).toBe(12);
    expect(T.kicker.fontWeight).toBe(600);
    expect(T.kicker.textTransform).toBe("uppercase");
    expect(T.kicker.letterSpacing).toBe(".12em");
    expect(T.kicker.color).toBe("var(--fb-muted)");
    expect(T.meta.fontSize).toBe(12);
    expect(T.meta.fontWeight).toBe(400);
    expect(T.meta.color).toBe("var(--fb-muted)");
    expect(T.body.fontSize).toBe(14);
    expect(T.lead.fontSize).toBe(16);
    expect(T.lead.fontWeight).toBe(600);
    expect(T.h2.fontSize).toBe(20);
    expect(T.zahl.fontSize).toBe(30);
    expect(T.zahl.fontWeight).toBe(600);
  });

  it("stellt Ziffern durchgehend tabellarisch", () => {
    for (const rolle of Object.values(T)) {
      expect(rolle.fontVariantNumeric).toBe("tabular-nums lining-nums");
    }
  });
});
