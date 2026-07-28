import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * DAS MODUL SCHALTET AUF DEM SUITE-BREAKPOINT UM, NICHT AUF EINEM EIGENEN.
 *
 * Bis 2026-07-27 standen hier drei Zahlen: 600 (Kartenpolster, Legende,
 * Knopfzeile, fb-block-mobil, Spurzeilen), 768 (Verlauf-Umschaltung) und 992
 * (fb-sticky). Bei 390px war das folgenlos, und genau deshalb ist es lange
 * niemandem aufgefallen. Gemessen bei 700x900: der Menue-Knopf der Shell war
 * sichtbar und der Verlauf zeigte die Schmalliste — beides sagt „mobil" — und
 * die Knoepfe standen trotzdem nebeneinander und inhaltsbreit („Kopieren" 88px,
 * „PNG" 61px). Jedes Tablet im Hochformat sah eine halb umgeschaltete
 * Oberflaeche.
 *
 * WARUM DREI ZAHLEN TROTZDEM RICHTIG SIND — und warum dieser Test sie einzeln
 * nennt statt „genau einen Breakpoint" zu behaupten:
 *
 *   767.98 = der Suite-Breakpoint von unten. Nicht 768, sonst gaelten bei exakt
 *            768px beide Regeln und die Reihenfolge im Stylesheet entschiede.
 *   768    = der Suite-Breakpoint von oben (= antds `md`).
 *   992    = antds `lg`, und KEINE Mobil-/Desktop-Umschaltung: es ist die
 *            Schwelle, ab der `groups/[groupId]/page.tsx:225,254` ueberhaupt
 *            zwei Spalten hat (`<Col xs={24} lg={…}>`). Eine mitfahrende rechte
 *            Karte in einer einspaltigen Seite klebte ueber der Lagekarte. Der
 *            Wert folgt einer Rasterentscheidung, nicht einer zweiten
 *            Vorstellung davon, was „mobil" heiszt.
 *
 * Warum Quelltext-Scan: jsdom wertet Media Queries nicht aus. Das Ergebnis
 * besitzt `e2e/mobil-admin.spec.ts` bei 700x900.
 */
const CSS = readFileSync("src/app/m/feedback/_ui/feedback.css", "utf8");
const OHNE_KOMMENTARE = CSS.replace(/\/\*[\s\S]*?\*\//g, "");

/**
 * MEHRERE Bloecke teilen sich denselben Wert `767.98px` (Kartenpolster,
 * Legende, Knopfzeile, fb-block-mobil, Spurzeilen) — ein einzelner `exec`
 * ueber die GANZE Datei greift deshalb zu weit: bei `.fb-knopfzeile` faende
 * er, von der ERSTEN `767.98px`-Abfrage aus lazy vorwaerts gelesen, zuerst die
 * BASISREGEL (`.fb-knopfzeile { display: flex; … }`, ausserhalb jeder
 * Medienabfrage), weil sie im Stylesheet VOR dem eigentlichen 767.98px-Block
 * mit `flex-direction: column` steht — und ein Test, der nur auf das
 * VORHANDENSEIN von `.fb-knopfzeile { … }` prueft, waere trotzdem gruen.
 * Deshalb zerlegt dieser Test die Datei zuerst in ihre einzelnen
 * `@media (max-width: 767.98px)`-Bloecke — erkennbar an der Einrueckung: die
 * schliessende Klammer EINES Blocks steht ohne Einzug in eigener Zeile, die
 * der Regeln DARIN mit mindestens einem Leerzeichen — und sucht darin gezielt.
 */
const MEDIA_767_BLOECKE = [
  ...OHNE_KOMMENTARE.matchAll(/@media \(max-width: 767\.98px\) \{([\s\S]*?)\n\}/g),
].map((m) => m[1]);

const findeRegel = (selektor: RegExp): RegExpExecArray | null => {
  for (const block of MEDIA_767_BLOECKE) {
    const treffer = selektor.exec(block);
    if (treffer) return treffer;
  }
  return null;
};

describe("feedback.css — Breakpoints", () => {
  /**
   * Nur `@media`, seit die Notenlegende an ihrem CONTAINER schaltet: eine
   * Containerabfrage ist kein Breakpoint der Suite, sie misst eine Spalte. Sie
   * mit in diese Menge zu zaehlen hiesse, ein Bauteil, das sich richtigerweise
   * NICHT am Fenster ausrichtet, gegen die Fenster-Breakpoints zu pruefen. Die
   * Container-Schwelle hat ihren eigenen Fall darunter.
   */
  it("kennt genau die begruendete Menge {767.98, 768, 992} an Medienabfragen", () => {
    const werte = [
      ...OHNE_KOMMENTARE.matchAll(/@media\s*\((?:min|max)-width:\s*([\d.]+)px\)/g),
    ].map((m) => m[1]);
    expect(werte.length).toBeGreaterThan(0);
    expect(new Set(werte)).toEqual(new Set(["767.98", "768", "992"]));
  });

  /**
   * Die eine Containerabfrage der Datei. 560px ist die gemessene Wortbreite der
   * Legende (466px zuzueglich Abstaende) plus Reserve fuer breitere
   * Schriftmetriken — auf einem Linux-Runner war „ungenügend" breit genug, um
   * genau diesen Unterschied auszumachen. Waechst die Menge, gehoert der neue
   * Wert begruendet; wandert die Zahl, muss der Kommentar in `feedback.css`
   * mitwandern.
   */
  it("kennt genau eine Containerabfrage, und zwar bei 560px", () => {
    const werte = [
      ...OHNE_KOMMENTARE.matchAll(/@container\s*\((?:min|max)-width:\s*([\d.]+)px\)/g),
    ].map((m) => m[1]);
    expect(werte).toEqual(["560"]);
  });

  it("hat keine 600px-Medienabfrage mehr", () => {
    expect(OHNE_KOMMENTARE).not.toMatch(/\((?:min|max)-width:\s*600px\)/);
  });

  it("stapelt die Knopfzeile unterhalb des Suite-Breakpoints", () => {
    const treffer = findeRegel(/\.fb-knopfzeile\s*\{([^}]*)\}/);
    expect(treffer, ".fb-knopfzeile fehlt in einem 767.98px-Block").not.toBeNull();
    expect(treffer![1]).toMatch(/flex-direction:\s*column/);
  });

  /**
   * Die Ausnahme aus Task 2: `Teilnahme.tsx:155` setzt `fb-knopfzeile` auf
   * einem antd-`Space` (`<Space wrap className="fb-knopfzeile">`). `Space`
   * huellt jedes Kind in `.ant-space-item`, dessen Breite es selbst aus dem
   * Inhalt nimmt — ohne die beiden Zusatzregeln blaebe `fb-block-mobil`
   * zwischen dem alten 600px und dem neuen 767.98px genau in dieser Reihe
   * wirkungslos. Der Test haelt fest, dass beide Regeln MIT dem Hauptblock
   * gewandert sind, nicht in einem eigenen (dann verwaisten) 600px-Rest.
   */
  it("nimmt die Space-Sonderregeln (`.ant-space`, `.ant-space-item`) mit in denselben Block", () => {
    const block = MEDIA_767_BLOECKE.find((b) => /\.fb-knopfzeile\s*\{/.test(b));
    expect(block, "kein 767.98px-Block mit .fb-knopfzeile gefunden").not.toBeUndefined();
    expect(block).toMatch(/\.fb-knopfzeile\.ant-space\s*\{\s*display:\s*flex/);
    expect(block).toMatch(/\.fb-knopfzeile\s*>\s*\.ant-space-item\s*\{\s*width:\s*100%/);
  });

  it("gibt `fb-block-mobil` unterhalb des Suite-Breakpoints volle Breite", () => {
    const treffer = findeRegel(/\.fb-block-mobil\s*\{([^}]*)\}/);
    expect(treffer, ".fb-block-mobil fehlt in einem 767.98px-Block").not.toBeNull();
    expect(treffer![1]).toMatch(/width:\s*100%/);
  });
});
