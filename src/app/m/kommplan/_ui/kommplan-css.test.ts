import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Die REGEL steht da (Quelltext-Scan, docs/design/README.md „Tests für Responsives"); dass sie WIRKT,
 * prüft `e2e/kommplan-editor.spec.ts` mit `emulateMedia({ reducedMotion: "reduce" })`.
 */
const css = readFileSync("src/app/m/kommplan/_ui/kommplan.css", "utf8");

describe("kommplan.css", () => {
  it("Gleiten und Nachziehen haben einen Zweig für reduzierte Bewegung", () => {
    const zweig = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
    expect(zweig).toMatch(/\.kp-gleitet \{ transition: none; \}/);
    expect(zweig).toMatch(/\.kp-nachziehen \{ animation: none; \}/);
  });
  it("Farben für Hell und Dunkel über data-theme, nie über prefers-color-scheme", () => {
    expect(css).not.toMatch(/prefers-color-scheme/);
    expect(css).toMatch(/:root\[data-theme="dark"\]/);
  });
  it("ein offenes Flyin schiebt den Editor ab Tablet-Breite zur Seite, statt Kopfleiste und Hinweise zu verdecken", () => {
    const zweig = /@media \(min-width: 768px\) \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
    expect(zweig).toMatch(/\.kp-editor\[data-flyin\] \{[^}]*padding-inline-end: var\(--kp-flyin-breite\)/);
  });
  it("Auswahlleiste oben links in der Fläche, feste Höhe: bricht nie um, scrollt am Telefon waagerecht mit Schattenkante, Name dort ausgeblendet (Phase 3, Entscheidung 18)", () => {
    expect(css).toMatch(/\.kp-auswahlleiste \{[^}]*position: absolute; top: 8px; left: 8px/);
    expect(css).toMatch(/\.kp-auswahlleiste \{[^}]*flex-wrap: nowrap/);
    expect(css).toMatch(/\.kp-auswahlleiste \{[^}]*overflow-x: auto/);
    expect(css).toMatch(/\.kp-auswahlleiste \{[^}]*background-attachment: local, local, scroll, scroll/); // Schattenkante nur, solange etwas verborgen ist
    expect(css).toMatch(/\.kp-auswahl-name \{[^}]*text-overflow: ellipsis/);
    expect(css).toMatch(/@media \(max-width: 767\.98px\) \{[\s\S]*\.kp-auswahl-name \{ display: none; \}/);
    expect(css).not.toMatch(/\.kp-griffleiste|\.kp-griff-seite|\.kp-griff-links|\.kp-griff-rechts/);
  });
  it("Rand der Auswahlleiste hebt sich ab (WCAG 1.4.11): mindestens 3:1 gegen ihre Fläche, hell und dunkel", () => {
    const hell = /:root \{[^}]*--kp-leiste-flaeche: (#[0-9a-f]{6});[^}]*--kp-leiste-rand: (#[0-9a-f]{6});/i.exec(css);
    const dunkel = /:root\[data-theme="dark"\] \{[^}]*--kp-leiste-flaeche: (#[0-9a-f]{6});[^}]*--kp-leiste-rand: (#[0-9a-f]{6});/i.exec(css);
    expect(hell && dunkel).toBeTruthy();
    expect(kontrast(hell![2], hell![1])).toBeGreaterThanOrEqual(3);
    expect(kontrast(dunkel![2], dunkel![1])).toBeGreaterThanOrEqual(3);
  });
  it("die Zeichnung ist nur das SVG direkt in der Fläche — kein Knopf und kein Zeichenknopf erbt ihre Größe", () => {
    expect(css).toMatch(/\.kp-betrachter > svg \{[^}]*width: 100%/);
    expect(css).not.toMatch(/\.kp-betrachter svg \{/);
    expect(css).not.toMatch(/\.kp-griff-inhalt/); // das Anbindungssymbol ist einer Beschriftung gewichen (Phase 3)
  });
  it("lange Zeichentitel brechen im Knopf um, statt über den Rand zu laufen (Sichtprüfung Phase 2)", () => {
    expect(css).toMatch(/\.kp-zeichen-knopf > span:last-child \{[^}]*overflow-wrap: anywhere/);
  });
  it("Auswahlrahmen auf dem Papier: in beiden Modi dieselbe Farbe, Kontrast zu Weiß mindestens 3:1 (WCAG 1.4.11, Review Phase 2)", () => {
    const dunkel = /:root\[data-theme="dark"\] \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
    expect(dunkel).not.toMatch(/--kp-auswahl-papier/);
    expect(css).toMatch(/\.kp-auswahlrahmen \{[^}]*border: 2px solid var\(--kp-auswahl-papier\)/);
    const farbe = /--kp-auswahl-papier: (#[0-9a-f]{6});/i.exec(css)?.[1];
    expect(farbe).toBeDefined();
    expect(kontrast(farbe!, "#ffffff")).toBeGreaterThanOrEqual(3);
  });
  it("Handlungsknöpfe der Kopfleiste stehen unter 768 px untereinander in voller Breite — auch „Teilen“ und „Drucken“ (README „Mobil“, Review Phase 5)", () => {
    const zweig = /@media \(max-width: 767\.98px\) \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
    expect(zweig).toMatch(/\.kp-kopfwerkzeuge \{ display: grid; grid-template-columns: minmax\(0, 1fr\); flex: 1 1 100%; \}/);
    expect(css).not.toMatch(/kp-ganze-zeile/);
  });
  it("Teilen-Flyin: „Abgelaufen und widerrufen“ zeigt einen eigenen Aufklapp-Pfeil; die Dauer bricht im eigenen Raster", () => {
    expect(css).toMatch(/\.kp-teilen details > summary::before \{[^}]*border-inline-start: 7px solid currentColor;/);
    expect(css).toMatch(/\.kp-teilen details\[open\] > summary::before \{ transform: rotate\(90deg\); \}/);
    expect(css).toMatch(/\.kp-teilen details > summary::-webkit-details-marker \{ display: none; \}/);
    expect(css).toMatch(/\.kp-teilen \.kp-dauer \{ display: grid; grid-template-columns: repeat\(auto-fit, minmax\(6\.5rem, 1fr\)\);/);
  });
  it("die Fläche des Editors endet am Bildrand, gemessen statt geschätzt (Hinweise unten bleiben im Bild)", () => {
    expect(css).toMatch(/\.kp-editor \.kp-betrachter \{ height: calc\(100dvh - var\(--kp-flaeche-oben, 240px\) - 48px\); \}/);
  });
  it("Gliederung: am Telefon Verbindung und Einheiten nur an der gewählten Zeile, Einrückung gedeckelt (Entscheidung 15)", () => {
    const zweig = /@media \(max-width: 767\.98px\) \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
    expect(zweig).toMatch(/\.kp-g-zeile:not\(\[aria-current="true"\]\) \.kp-g-neben \{ display: none; \}/);
    expect(zweig).toMatch(/\.kp-g-zeile \{ padding-inline-start: calc\(min\(var\(--ebene\), 6\) \* 16px\); \}/);
    expect(css).toMatch(/\.kp-g-meldung \{[^}]*position: sticky/);
  });
  it("Ansichten: ausdrücklich per data-editoransicht, ohne Wahl per Breakpoint — in den vorhandenen Blöcken (Phase 3, Entscheidung 1)", () => {
    expect(css).toMatch(/\.kp-editor\[data-editoransicht="diagramm"\] \.kp-ansicht-gliederung,\s*\.kp-editor\[data-editoransicht="gliederung"\] \.kp-ansicht-diagramm \{ display: none; \}/);
    const schmal = /@media \(max-width: 767\.98px\) \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
    expect(schmal).toMatch(/\.kp-editor\[data-editoransicht="auto"\] \.kp-ansicht-diagramm,\s*\.kp-editor \.kp-nur-breit \{ display: none; \}/);
    const breit = /@media \(min-width: 768px\) \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
    expect(breit).toMatch(/\.kp-editor\[data-editoransicht="auto"\] \.kp-ansicht-gliederung,\s*\.kp-editor \.kp-nur-schmal \{ display: none; \}/);
  });
  it("leerer Zeichenplatz der Gliederung ist kein weißer Block im Dunkeln — nur ein gezeichnetes Zeichen ist Papier (Sichtprüfung Phase 3)", () => {
    expect(css).toMatch(/\.kp-g-zeichen svg \{[^}]*background: #ffffff/);
    expect(css).toMatch(/\.kp-g-zeichen-leer \{[^}]*background: transparent/);
  });
  it("Seitenstellen-Chip der Gliederung: am Telefon eine eigene Zeile über Zeichen und Titel (Sichtprüfung Phase 3)", () => {
    const zweig = /@media \(max-width: 767\.98px\) \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
    expect(zweig).toMatch(/\.kp-g-lage \{ flex-basis: 100%; order: -1; \}/);
  });
  it("Seitenstellen-Chip der Gliederung hebt sich vom Seitengrund der Shell ab, hell wie dunkel (Review Phase 3)", () => {
    const hell = /:root \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
    const dunkel = /:root\[data-theme="dark"\] \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
    const wert = (block: string, name: string) => new RegExp(`--${name}: (#[0-9a-f]{6});`, "i").exec(block)?.[1] ?? "";
    expect(css).toMatch(/\.kp-g-lage \.kp-chip \{ background: var\(--kp-g-chip-flaeche\); \}/);
    expect(kontrast(wert(hell, "kp-g-chip-flaeche"), "#eef0f1")).toBeGreaterThanOrEqual(1.35); // Layout.bodyBg hell
    expect(kontrast(wert(dunkel, "kp-g-chip-flaeche"), "#000000")).toBeGreaterThanOrEqual(1.35); // Layout.bodyBg dunkel
    expect(kontrast(wert(hell, "kp-g-chip-flaeche"), wert(hell, "kp-chip-text"))).toBeGreaterThanOrEqual(4.5);
    expect(kontrast(wert(dunkel, "kp-g-chip-flaeche"), wert(dunkel, "kp-chip-text"))).toBeGreaterThanOrEqual(4.5);
  });
  it("Telefon: Leerzustand mit vollbreitem Knopf; Titel gibt nach, „⋯“ bleibt in der Zeile; Verlaufsleiste klebt unten (Review Phase 3)", () => {
    const schmal = /@media \(max-width: 767\.98px\) \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
    expect(schmal).toMatch(/\.kp-leer \{ justify-items: stretch; \}/);
    expect(schmal).toMatch(/\.kp-g-haupt \.kp-g-titel \{ flex-basis: 6rem; \}/);
    expect(schmal).toMatch(/\.kp-g-neben \{ order: 1; flex-basis: 100%; \}/);
    expect(css).toMatch(/\.kp-verlaufsleiste \{[^}]*position: sticky; bottom: 0;/);
  });
  it("breit: Verbindung und Einheiten in fester Breite, damit sie über alle Zeilen fluchten (Review Phase 3)", () => {
    const breit = /@media \(min-width: 768px\) \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
    expect(breit).toMatch(/\.kp-g-neben \{ flex: 0 0 26rem; flex-wrap: nowrap; \}/);
    // neben einem Flyin ist die Liste schmal: dort Verbindung und Einheiten in eigener Zeile, „⋯“ bleibt oben
    expect(css).toMatch(/\.kp-g-liste \{ container-type: inline-size; \}/);
    const schmaleListe = /@container \(max-width: 44rem\) \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
    expect(schmaleListe).toMatch(/\.kp-g-liste \.kp-g-neben \{ order: 1; flex: 1 1 100%; \}/);
  });
});

/** Kontrastverhältnis nach WCAG 2.x (relative Leuchtdichte). */
function kontrast(a: string, b: string): number {
  const l = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hell, dunkel] = [l(a), l(b)].sort((x, y) => y - x);
  return (hell + 0.05) / (dunkel + 0.05);
}

describe("Bibliothek in der Gliederung (Phase 4)", () => {
  it("Titelvorschläge: ohne Ebenenterm (stehen schon in der eingerückten Zeile), einzeilig, am Telefon ohne Alt-Hinweis", () => {
    const regel = /\.kp-g-vorschlaege \{([^}]*)\}/.exec(css)![1];
    expect(regel).not.toMatch(/--ebene/);
    expect(regel).toMatch(/flex-wrap: nowrap/);
    expect(regel).toMatch(/overflow-x: auto/);
    expect(css).toMatch(/@media \(max-width: 767\.98px\) \{[\s\S]*\.kp-vorschlag-hinweis \{ display: none; \}/);
  });
});

describe("Sichtprüfung Phase 4", () => {
  it("die Spalte der Gliederung wächst nicht mit den Vorschlägen: drei lange Vorschläge scrollen in ihrer Leiste statt die Seite zu verbreitern", () => {
    expect(css).toMatch(/\.kp-g-liste \{[^}]*grid-template-columns: minmax\(0, 1fr\)/);
  });
  it("Regeln der Phase 4 stehen VOR den Breakpoint-Blöcken — sonst schlügen sie deren Telefonregeln bei gleicher Spezifität", () => {
    const telefon = css.indexOf("@media (max-width: 767.98px)");
    for (const regel of [".kp-bib-werkzeuge {", ".kp-g-vorschlaege {", ".kp-kopfvorschau {", ".kp-listenhinweis {", ".kp-bib-einheiten {"]) {
      expect(css.indexOf(regel), regel).toBeGreaterThan(-1);
      expect(css.indexOf(regel), regel).toBeLessThan(telefon);
    }
  });
  it("Seitenkopf der Planliste am Telefon: die Aktionen selbst nehmen die volle Breite (sie sind Flex-Kind des Kern-Behälters)", () => {
    expect(css).toMatch(/@media \(max-width: 767\.98px\) \{[\s\S]*\.kp-kopfaktionen \{[^}]*flex: 1 1 100%/);
  });
  it("Suchfeld der Bibliothek ab 768 px nicht zeilenfüllend: „Neue …“ steht daneben", () => {
    expect(css).toMatch(/\.kp-bib-werkzeuge > \.kp-bib-suche \{[^}]*flex: 0 1 24rem/);
  });
  it("Druck: EIN Stylesheet, zwei benannte @page mit ausgeschriebenen Kanten, Wahl am gemeinsamen Vorfahren (Falle 18)", () => {
    const css = readFileSync("src/app/m/kommplan/_ui/druck/druck.css", "utf8");
    expect(css).toMatch(/@page kommplan-a4\s*\{\s*size:\s*297mm 210mm;/);
    expect(css).toMatch(/@page kommplan-a3\s*\{\s*size:\s*420mm 297mm;/);
    expect(css).toMatch(/\.kp-druck\[data-format="a4-quer"\]\s*\{\s*page:\s*kommplan-a4;\s*\}/);
    expect(css).toMatch(/\.kp-druck\[data-format="a3-quer"\]\s*\{\s*page:\s*kommplan-a3;\s*\}/);
    expect(css).not.toMatch(/size:\s*A[3-8]/i);
  });
  it("Token-Ansicht am Telefon: der umrandete VS-NfD-Vermerk bricht nicht in sich um (Sichtprüfung Phase 5)", () => {
    const token = readFileSync("src/app/m/kommplan/_ui/token/token.css", "utf8");
    const zweig = /@media \(max-width: 767\.98px\) \{([\s\S]*?)\n\}/.exec(token)?.[1] ?? "";
    expect(zweig).toMatch(/\.kp-token-links \.kp-token-vermerk \{[^}]*white-space: nowrap;/);
  });
});
