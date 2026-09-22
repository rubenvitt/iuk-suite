import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * ANTD-TABELLEN SCROLLEN AUF SCHMALEN GERAETEN, SIE BRECHEN NICHT UM
 * (docs/design/README.md, Abschnitt „Mobil").
 *
 * ══ WAS SICH MIT `@/core/tabelle` GEAENDERT HAT — UND WAS NICHT.
 *
 * Die Zusage ist dieselbe geblieben, ihr TRAEGER hat gewechselt. Hier stand ein
 * Scan auf `scroll={{ x: "max-content" }}` im Quelltext jeder Tabelle; seit der
 * Umstellung IST `{ x: "max-content" }` die Vorgabe der `Datentabelle`
 * (`core/tabelle/masse.ts`, `BREITE_NACH_INHALT`), und eine Tabelle, die die
 * Prop noch selbst schriebe, waere die Abweichung. Der Scan prueft deshalb jetzt
 * das, was die Zusage heute traegt: die Tabelle ist eine `Datentabelle` und
 * setzt KEIN eigenes `scroll` daneben.
 *
 * Warum weiterhin Quelltext-Scan und nicht jsdom: die Regel IST eine Prop. Ein
 * DOM-Test saehe sie zwar auch, aber er koennte die Wirkung nicht pruefen —
 * jsdom berechnet kein Layout und wertet keine Media Queries aus. Das sichtbare
 * Ergebnis besitzt `e2e/mobil-admin.spec.ts` bei 390x844 (die Seite scrollt
 * nicht seitwaerts) und bei 1280x800 (`table-layout` bleibt `auto`, die grobe
 * Spaltenverteilung bleibt erhalten). NICHT pixelgenau unveraendert: `scroll.x`
 * laesst rc-table eine zusaetzliche `MeasureRow` in tbody rendern (Body/
 * MeasureRow.js), die bei `auto`-Layout mitmisst und die Spaltenbreiten
 * gemessen um 1-4px verschiebt (Task-2-Bericht, 1280x800 vorher/nachher).
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
    it(`${name} bekommt die Scroll-Vorgabe der Datentabelle`, () => {
      const quelle = readFileSync(datei, "utf8");
      /*
       * ⚠️ `Kartentabelle` ZAEHLT MIT (DRK-451). Sie ist keine zweite Tabelle,
       * sondern ein Mantel UM die `Datentabelle` — sie reicht `columns`,
       * `dataSource` und alles Weitere unveraendert durch und ruehrt `scroll`
       * nicht an. Die Zusage dieses Scans („die Scroll-Vorgabe der
       * Datentabelle gilt") traegt sie damit genauso; nur der Bezeichner im
       * Quelltext hat gewechselt. Der Scan darauf zu verengen haette eine
       * richtige Datei fuer falsch erklaert.
       */
      expect(quelle, `${datei}: weder Daten- noch Kartentabelle — woher kaeme das scroll?`)
        .toMatch(/<(Daten|Karten)tabelle</);
      /*
       * KEIN EIGENES `scroll` DANEBEN. `Datentabelle` reicht ein uebergebenes
       * `scroll` unveraendert durch und ersetzt die Vorgabe damit — genau das
       * waere hier der stille Rueckschritt, und genau das faengt diese Zeile.
       * (Die Ausnahme steht unten: `Verlauf.tsx` DARF, und muss sogar.)
       */
      expect(quelle, `${datei}: eigenes scroll ueberschreibt die Vorgabe`).not.toMatch(
        /\bscroll=\{/,
      );
    });

    it(`${name} hat weiterhin keine Spalte mit ellipsis`, () => {
      /*
       * DIE BEDINGUNG, UNTER DER `max-content` RICHTIG IST.
       * rc-table (Table.js:432-438) prueft `flattenColumns.some(({ellipsis}) =>
       * ellipsis)` — also Wahrheit, nicht `=== true`. `CellEllipsisType` ist
       * `{ showTitle?: boolean } | boolean` (interface.d.ts:70-72): ein
       * `ellipsis: { showTitle: false }` ist ein wahres Objekt und schaltet
       * genauso auf `table-layout: fixed` wie `ellipsis: true` — deshalb prueft
       * der Regex unten BEIDE Formen, nicht nur das Literal `true`.
       * Bei `fixed` verteilt rc-table die Spalten gleichmaeszig und das
       * Desktop-Bild aendert sich grundlegend (anders als die 1-4px-Verschiebung
       * durch die MeasureRow bei `auto`, s. Docblock oben). Solange keine Spalte
       * `ellipsis` traegt, bleibt es auf `auto` und `min-width: 100%` haelt die
       * Tabelle bei 1280px in ihrer heutigen Groessenordnung. Wer spaeter ein
       * `ellipsis` ergaenzt, muss diesen Test lesen, nicht loeschen.
       */
      const quelle = readFileSync(datei, "utf8");
      expect(quelle, `${datei}: ellipsis gesetzt — max-content neu bewerten`).not.toMatch(
        /ellipsis:\s*(true|\{)/,
      );
    });
  }

  it("Verlauf.tsx schaltet die Vorgabe bewusst AB", () => {
    /*
     * Gegenprobe zum haeufigsten Missverstaendnis: die Tabelle in Verlauf.tsx
     * hat kein waagerechtes Scrollen und braucht keins. Sie liegt in
     * `.fb-verlauf-breit`, das unterhalb des Suite-Breakpoints `display: none`
     * ist; bei 768px stehen ihr 736px zur Verfuegung und sie belegt gemessen
     * 736. Und sie traegt ein `ellipsis` (Spalte „Thema"), dessen ganze Aufgabe
     * das Abschneiden ist — unter `max-content` wuechse die Spalte stattdessen.
     *
     * SEIT DER UMSTELLUNG IST DAS EINE AKTIVE ENTSCHEIDUNG, KEINE AUSLASSUNG:
     * `Datentabelle` gibt `{ x: "max-content" }` vor, also muss die Datei die
     * Vorgabe ausdruecklich abschalten. Hier steht deshalb das Gegenteil von
     * frueher — das `scroll` MUSS da sein, und es muss `false` sein. Dass keine
     * waagerechte Scroll-Huelle entsteht, misst `Verlauf.test.tsx` am DOM.
     */
    const quelle = readFileSync("src/app/m/feedback/_ui/Verlauf.tsx", "utf8");
    expect(quelle).toMatch(/scroll=\{false\}/);
    // Und kein zweites, echtes `scroll` daneben.
    expect(quelle).not.toMatch(/scroll=\{\{/);
  });
});
