import type { ThemeConfig } from "antd";
import { ARBEITSDICHTE } from "@/core/theme/theme";
import { SPACE } from "@/core/theme/tokens";

/** Höhe eines Bedienelements in der Verwaltung — aus `ARBEITSDICHTE`, nicht abgeschrieben. */
const BEDIENHOEHE = ARBEITSDICHTE.token?.controlHeight ?? 44;

/**
 * Zeilenbox einer Tabellenzelle: antds `fontSize` 14 × `lineHeight` 1.5714,
 * abgerundet wie in antd selbst (`InternalTable.js`, `fontHeight`).
 * `dichte.test.ts` rechnet sie aus dem Suite-Theme nach.
 */
export const ZEILENBOX = 22;

/**
 * DIE LUFT DER LAGERBUCH-VERWALTUNG — weniger Polster, gleiche Bedienhöhe
 * (IDA-234, Betreiberwunsch vom 2026-10-18: „mehr auf eine Seite", Tablet und
 * Computer).
 *
 * ⚠️ KEIN `controlHeight`, und das ist die Entscheidung, nicht eine Lücke. Die
 * Verwaltung wird am Tablet mit dem Finger bedient; die 44 px aus
 * `ARBEITSDICHTE` (`core/theme/theme.ts`) bleiben stehen, weil sie die
 * WCAG-2.5.5-Untergrenze der Suite sind. Gewonnen wird an dem, was zwischen
 * den Bedienelementen liegt: Zellenpolster, Kartenpolster, Kartenkopf.
 * `SCHREIBTISCHDICHTE` (32/40, nur Maus) wäre ein eigener Schritt mit eigener
 * Entscheidung; `dichte.test.ts` riegelt ab, dass hier keine Höhe einwandert.
 *
 * ÜBER TOKENS, NICHT ÜBER CSS gegen `.ant-table-cell` (Falle 5 und 20): antd
 * legt die Werte als Variablen auf die Scope-Klasse jeder Tabelle und Karte
 * unter diesem Provider. Ein Regeltext könnte still sterben; der Token wird in
 * `dichte.test.ts` am erzeugten Stylesheet nachgemessen.
 *
 * DIE ZAHLEN:
 * - `Table.cellPaddingBlock` 16 → 11, GERECHNET statt gewählt: eine reine
 *   Textzeile (Zeilenbox 22 px) ist damit genau so hoch wie ein Bedienelement
 *   der Arbeitsdichte, 22 + 2 × 11 + 1 = 45 px statt 55. Eine Zeile mit einem
 *   44-px-Feld oder -Knopf wird 67 statt 77.
 *   ⚠️ NICHT 8 (antds kleine Tabelle, 39 px), obwohl das mehr Zeilen brächte:
 *   das Polster gilt auch im SPALTENKOPF, und ein sortierbarer Kopf ist als
 *   ganze Zelle ein Tippziel. Einen eigenen Token nur für den Kopf hat antd
 *   nicht, und CSS gegen `.ant-table-thead` wäre Falle 5/20. Ebenso ist die
 *   Artikelzeile als Ganzes klickbar (`onRow`, öffnet die Schublade).
 * - `Table.cellPaddingInline` 16 → 12. Zwischen zwei Spalten bleiben 24 px;
 *   die Spalten lesen sich weiter getrennt, die Tabelle wird schmaler und
 *   scrollt am Tablet seltener waagerecht.
 * - `Card.bodyPadding`/`headerPadding` 24 → 16: der Innenrand der Karte
 *   deckt sich mit dem Innenrand der Inhaltsfläche (`SuiteRahmen`, `SPACE.lg`).
 * - `Card.headerHeight` 56 → 48: der Kartenkopf trägt höchstens einen 44-px-
 *   Knopf (`extra`) und wächst über `min-height` mit, wenn er mehr trägt.
 *
 * WAS KEIN TOKEN IST, steht an der Seite selbst: der Abstand zwischen zwei
 * Abschnitten (Kachelreihe, Karte, Karte) ist dort `SPACE.lg` statt `SPACE.xl`,
 * also so groß wie das Kartenpolster; das Kachelpolster steht in `_ui/Kachel.tsx`.
 *
 * GILT NUR UNTER `VerwaltungsRahmen` — nicht für die Helferflächen (56/72, ohne
 * Shell), nicht für andere Module, nicht für Kopfzeile und Modulleiste.
 * Schubladen und Dialoge der Verwaltung erben ihn über den React-Baum mit,
 * obwohl sie ins `body` portiert werden.
 *
 * KEIN `"use client"` (Falle 6): `Verwaltungsluft.tsx` ist die Client-Insel,
 * dieser Wert ist auch aus Tests und Server-Code lesbar.
 */
export const VERWALTUNGSLUFT: ThemeConfig = {
  cssVar: { key: "lb-luft" },
  components: {
    Table: { cellPaddingBlock: (BEDIENHOEHE - ZEILENBOX) / 2, cellPaddingInline: SPACE.md },
    Card: { bodyPadding: SPACE.lg, headerPadding: SPACE.lg, headerHeight: 48 },
  },
};
