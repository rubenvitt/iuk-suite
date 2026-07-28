import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * ANTD-TABELLEN SCROLLEN AUF SCHMALEN GERAETEN, SIE BRECHEN NICHT UM
 * (docs/design/README.md, Abschnitt „Mobil").
 *
 * Warum Quelltext-Scan und nicht jsdom: die Regel IST eine Prop. Ein DOM-Test
 * saehe sie zwar auch, aber er koennte die Wirkung nicht pruefen — jsdom
 * berechnet kein Layout und wertet keine Media Queries aus. Das sichtbare
 * Ergebnis besitzt `e2e/mobil-admin.spec.ts` bei 390x844 (die Seite scrollt
 * nicht seitwaerts) und bei 1280x800 (die Spaltenbreiten sind unveraendert).
 *
 * `max-content` und nicht eine Zahl: KEINE der zehn Spalten dieser beiden
 * Tabellen traegt ein `width`. Eine Pixelsumme waere erfunden. `Verlauf.tsx`
 * waere der Gegenfall (fuenf von sechs Spalten mit `width`, Summe 680) — die
 * Tabelle braucht die Prop aber gar nicht, weil `.fb-verlauf-breit` unter 768px
 * `display: none` ist und dort die Schmalliste steht.
 */
const TABELLEN = [
  { datei: "src/app/m/feedback/_ui/VergleichTabelle.tsx", name: "Gruppenvergleich" },
  { datei: "src/app/m/portal/admin/service-table.tsx", name: "portal-Dienste" },
];

describe("Tabellen mit Scroll-Zusage", () => {
  for (const { datei, name } of TABELLEN) {
    it(`${name} traegt scroll mit x`, () => {
      const quelle = readFileSync(datei, "utf8");
      expect(quelle, `${datei}: scroll-Prop fehlt`).toMatch(
        /scroll=\{\{\s*x:\s*["']max-content["']\s*\}\}/,
      );
    });

    it(`${name} hat weiterhin keine Spalte mit ellipsis`, () => {
      /*
       * DIE BEDINGUNG, UNTER DER `max-content` RICHTIG IST.
       * rc-table (lib/Table.js:426-442) schaltet auf `table-layout: fixed`,
       * sobald eine Spalte `ellipsis` traegt — dann verteilt es die Spalten
       * gleichmaeszig und das Desktop-Bild aendert sich. Solange keine Spalte
       * `ellipsis` hat, bleibt es auf `auto` und `min-width: 100%` haelt die
       * Tabelle bei 1280px so breit wie heute. Wer spaeter ein `ellipsis`
       * ergaenzt, muss diesen Test lesen, nicht loeschen.
       */
      const quelle = readFileSync(datei, "utf8");
      expect(quelle, `${datei}: ellipsis gesetzt — max-content neu bewerten`).not.toMatch(
        /ellipsis:\s*true/,
      );
    });
  }

  it("Verlauf.tsx bekommt bewusst KEIN scroll", () => {
    /*
     * Gegenprobe zum haeufigsten Missverstaendnis: die Tabelle in Verlauf.tsx
     * hat kein `scroll` und braucht keins. Sie liegt in `.fb-verlauf-breit`,
     * das unterhalb des Suite-Breakpoints `display: none` ist; bei 768px stehen
     * ihr 736px zur Verfuegung und sie belegt gemessen 736. Ein `scroll` hier
     * waere nicht falsch, aber es waere eine Prop ohne Anlass — und sie traegt
     * ein `ellipsis` (Spalte „Thema"), was `table-layout: fixed` ausloesen und
     * das Desktop-Bild veraendern wuerde.
     */
    const quelle = readFileSync("src/app/m/feedback/_ui/Verlauf.tsx", "utf8");
    expect(quelle).not.toMatch(/scroll=\{\{/);
  });
});
