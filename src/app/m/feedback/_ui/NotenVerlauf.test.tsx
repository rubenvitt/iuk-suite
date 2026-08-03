// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Line, ReferenceArea, YAxis } from "recharts";
import { LabelList } from "recharts";
import {
  MAX_SERIEN,
  NotenVerlauf,
  endBeschriftung,
  letzterWert,
  type NotenVerlaufPunkt,
  type NotenVerlaufSerie,
} from "./NotenVerlauf";

/**
 * DER NOTENVERLAUF (Entwurf §3.3, §5.3).
 *
 * EINE Zusage traegt diese Datei, und sie ist ein SACHFEHLER, wenn sie bricht:
 * ein Diagramm, in dem eine 6 hoeher steht als eine 1, behauptet das Gegenteil
 * der Wahrheit. Die deutsche Schulnote ist invertiert — 1 ist die beste Note.
 * Deshalb `YAxis reversed`, deshalb ein festes Domain 1–6 (ein datenabhaengiges
 * Domain laesst die Steigung luegen), und deshalb steht „1 OBEN = BESSER"
 * dauerhaft im Plot.
 *
 * WARUM MODUL-LOKAL UND NICHT `core/charts` (§5.3): `core/charts/LineChart`
 * faerbt mit `token.colorPrimary` (= Suite-Rot, Farb-Klausel) und kennt weder
 * `reversed` noch `ReferenceArea`-Kinder noch farbige Punkte je Wert. Alle vier
 * fehlenden Faehigkeiten haetten ausschliesslich Aufrufer in diesem Modul.
 *
 * DER PRUEFSTAND IST DER ELEMENTBAUM, NICHT DAS MARKUP: rechartss
 * `ResponsiveContainer` misst seinen Elternknoten und rendert unter jsdom (Hoehe
 * 0) NICHTS. Eine Markup-Assertion auf `reversed` waere deshalb immer leer und
 * saehe wie ein kaputtes Bauteil aus. Der Baum ist dagegen deterministisch.
 */

const UI = join(process.cwd(), "src/app/m/feedback/_ui");
const ohneKommentare = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const QUELLE = ohneKommentare(readFileSync(join(UI, "NotenVerlauf.tsx"), "utf8"));

/** Alle React-Elemente des Baums in Dokumentordnung — inklusive Kinder in Arrays. */
function alleElemente(knoten: ReactNode, aus: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(knoten)) {
    knoten.forEach((k) => alleElemente(k as ReactNode, aus));
    return aus;
  }
  if (!isValidElement(knoten)) return aus;
  aus.push(knoten);
  const kinder = (knoten.props as { children?: ReactNode }).children;
  if (kinder !== undefined) alleElemente(kinder, aus);
  return aus;
}

const PUNKTE: NotenVerlaufPunkt[] = [
  { label: "2026-02", note: 2.4 },
  { label: "2026-03", note: null },
  { label: "2026-04", note: 1.6 },
  { label: "2026-05", note: 5.5 },
];

/**
 * `NotenVerlauf` ist eine reine Funktion ohne Hooks (kein `theme.useToken()` —
 * die Farben kommen als `--fb-*`/`--note-*` aus `feedback.css`, §4.10). Deshalb
 * darf der Test sie direkt aufrufen und den Baum begehen.
 */
const baum = (
  punkte = PUNKTE,
  extra: { hoehe?: number; serien?: NotenVerlaufSerie[] } = {},
) => alleElemente(NotenVerlauf({ punkte, ...extra }) as ReactElement);

const markup = (punkte = PUNKTE) =>
  renderToStaticMarkup(NotenVerlauf({ punkte }) as ReactElement);

describe("NotenVerlauf — die Achse ist invertiert (§3.3)", () => {
  it("traegt `reversed`, damit Note 1 OBEN steht", () => {
    const achse = baum().find((e) => e.type === YAxis);
    expect(achse).toBeDefined();
    expect((achse!.props as { reversed?: boolean }).reversed).toBe(true);
  });

  it("hat ein FESTES Domain 1–6 mit allen sechs Ticks — nie ein datenabhaengiges", () => {
    const achse = baum().find((e) => e.type === YAxis)!;
    const props = achse.props as { domain?: unknown; ticks?: unknown };
    expect(props.domain).toEqual([1, 6]);
    expect(props.ticks).toEqual([1, 2, 3, 4, 5, 6]);
    // Ein automatisches Domain macht aus 2,0 → 2,1 einen Absturz.
    expect(QUELLE).not.toContain("dataMin");
    expect(QUELLE).not.toContain("dataMax");
  });

  it("sagt die Richtung im Plot AUSDRUECKLICH — sonst ist jede Kurve zweideutig", () => {
    expect(markup()).toContain("1 OBEN = BESSER");
  });

  it("zeichnet sechs Notenbaender als Diagrammgrund, textfrei und in den Toenungen", () => {
    const baender = baum().filter((e) => e.type === ReferenceArea);
    expect(baender).toHaveLength(6);
    const fuellungen = baender.map((b) => (b.props as { fill?: string }).fill);
    expect(fuellungen).toEqual([
      "var(--note-tint-1)",
      "var(--note-tint-2)",
      "var(--note-tint-3)",
      "var(--note-tint-4)",
      "var(--note-tint-5)",
      "var(--note-tint-6)",
    ]);
    // Ein Band traegt NIE Text (§4.11: Notenfarbe auf eigener Toenung ~2:1).
    baender.forEach((b) => expect((b.props as { label?: unknown }).label).toBeUndefined());
    // Jedes Band deckt genau eine Note ab — 1..2, 2..3, … 6..7 waere ein
    // Band zu viel und 1..6 in fuenf Baendern eines zu wenig.
    expect(baender.map((b) => (b.props as { y1?: number }).y1)).toEqual([0.5, 1.5, 2.5, 3.5, 4.5, 5.5]);
  });

  it("verbindet Luecken NICHT — ein Monat ohne Note ist keine gerade Linie", () => {
    const linie = baum().find((e) => e.type === Line)!;
    const props = linie.props as { connectNulls?: boolean; stroke?: string; strokeWidth?: number };
    expect(props.connectNulls).toBe(false);
    expect(props.stroke).toBe("var(--fb-ink)");
    expect(props.strokeWidth).toBe(2);
  });

  it("faerbt jeden Punkt in der Farbe SEINES Wertes, nicht der Linie", () => {
    const linie = baum().find((e) => e.type === Line)!;
    const punkt = (linie.props as { dot?: unknown }).dot;
    expect(typeof punkt).toBe("function");
    // 1,6 → Stufe 2, 5,5 → Stufe 6 (Schwellen aus `_lib/noten.ts`).
    const gezeichnet = (note: number) =>
      renderToStaticMarkup(
        (punkt as (p: { cx: number; cy: number; payload: { note: number | null } }) => ReactElement)({
          cx: 10,
          cy: 20,
          payload: { note },
        }),
      );
    expect(gezeichnet(1.6)).toContain("var(--note-2)");
    expect(gezeichnet(5.5)).toContain("var(--note-6)");
    // Ohne Wert kein Punkt — sonst saesse ein Punkt auf einer Note, die niemand gab.
    expect(
      (punkt as (p: { cx: number; cy: number; payload: { note: number | null } }) => ReactElement | null)(
        { cx: 10, cy: 20, payload: { note: null } },
      ),
    ).toBeNull();
  });
});

describe("NotenVerlauf — Leerzustand und Herkunft", () => {
  it("zeigt unter zwei Werten den Satz aus §4.3 statt eines leeren Achsenkreuzes", () => {
    const einer = markup([{ label: "2026-04", note: 2 }, { label: "2026-05", note: null }]);
    expect(einer).toContain("Weniger als zwei ausgewertete Abende — für einen Verlauf zu früh.");
    expect(baum([{ label: "2026-04", note: 2 }]).some((e) => e.type === YAxis)).toBe(false);
  });

  it("ruehrt `core/charts` nicht an und nennt `colorPrimary` nirgends (§5.3, Farb-Klausel)", () => {
    expect(QUELLE).not.toContain("core/charts");
    expect(QUELLE).not.toContain("colorPrimary");
    expect(QUELLE.toLowerCase()).not.toContain("#c8000f");
    // Keine `--ant-*`-Variable in eigenem Markup (§4.10).
    expect(QUELLE).not.toMatch(/--ant-/);
  });
});

/**
 * DIE ZUSCHALTBAREN FRAGEKURVEN (§3.3, wortgenau: „Nur die
 * Gesamtdurchschnittslinie ist Vorgabe; einzelne Fragen sind zuschaltbar, maximal
 * drei gleichzeitig, gestrichelt und direkt beschriftet — acht Kurven in einem
 * Bild waeren Spaghetti").
 *
 * DIE EINE ZUSAGE, DIE HIER EIN SACHFEHLER WAERE: eine Fragekurve darf KEINE
 * Notenfarbe tragen. Die Notenpalette gehoert WERTEN der Schulnotenskala, nie
 * einer Serie — eine gruen gezeichnete Frage behauptete, die Frage sei gut.
 */
describe("NotenVerlauf — zuschaltbare Fragekurven (§3.3)", () => {
  const SERIEN: NotenVerlaufSerie[] = [
    { id: "q1", label: "Insgesamt?", werte: [2, 2.5, 1.5, null] },
    { id: "q2", label: "Vorbereitet?", werte: [3, null, 3.5, 4] },
  ];

  /** Nur die gestrichelten Serienlinien, ohne die Gesamtlinie. */
  const serienlinien = (serien: NotenVerlaufSerie[]) =>
    baum(PUNKTE, { serien }).filter(
      (e) => e.type === Line && (e.props as { dataKey?: string }).dataKey !== "note",
    );

  it("zeichnet ohne Serien genau EINE Linie — die Gesamtdurchschnittslinie", () => {
    const linien = baum().filter((e) => e.type === Line);
    expect(linien).toHaveLength(1);
    expect((linien[0].props as { dataKey?: string }).dataKey).toBe("note");
  });

  it("zeichnet je zugeschalteter Frage eine GESTRICHELTE Linie", () => {
    const linien = serienlinien(SERIEN);
    expect(linien).toHaveLength(2);
    for (const l of linien) {
      const props = l.props as {
        strokeDasharray?: string;
        stroke?: string;
        connectNulls?: boolean;
        dot?: unknown;
      };
      expect(props.strokeDasharray).toBeTruthy();
      // Ein Monat ohne Wert reisst die Kurve auf, wie bei der Gesamtlinie.
      expect(props.connectNulls).toBe(false);
      // Keine Punkte: acht Punktreihen uebereinander waeren das Spaghettibild.
      expect(props.dot).toBe(false);
    }
    // Und die Gesamtlinie bleibt durchgezogen — sie ist die Vorgabe (§3.3).
    const gesamt = baum(PUNKTE, { serien: SERIEN }).find(
      (e) => e.type === Line && (e.props as { dataKey?: string }).dataKey === "note",
    )!;
    expect((gesamt.props as { strokeDasharray?: string }).strokeDasharray).toBeUndefined();
  });

  it("faerbt keine Serie mit einer NOTENFARBE — die gehoert Werten, nicht Kategorien", () => {
    for (const l of serienlinien(SERIEN)) {
      const stroke = (l.props as { stroke?: string }).stroke ?? "";
      expect(stroke).not.toMatch(/--note-/);
      expect(stroke).toBe("var(--fb-muted)");
    }
  });

  it("beschriftet jede Kurve DIREKT — keine Legende", () => {
    const beschriftungen = baum(PUNKTE, { serien: SERIEN }).filter((e) => e.type === LabelList);
    expect(beschriftungen).toHaveLength(2);
    // Eine `Legend` waere die Loesung, die §3.3 ausschliesst.
    expect(QUELLE).not.toContain("Legend");
  });

  it("deckelt auf drei Kurven, auch wenn der Aufrufer mehr uebergibt", () => {
    const vier: NotenVerlaufSerie[] = ["q1", "q2", "q3", "q4"].map((id) => ({
      id,
      label: id,
      werte: [2, 2, 2, 2],
    }));
    expect(MAX_SERIEN).toBe(3);
    expect(serienlinien(vier)).toHaveLength(3);
  });

  it("setzt die Beschriftung an den letzten Punkt MIT Wert, nicht an den Rand", () => {
    // [2, 2.5, 1.5, null] → letzter Wert bei Index 2.
    expect(letzterWert(SERIEN[0].werte)).toBe(2);
    expect(letzterWert([null, null])).toBe(-1);

    const inhalt = endBeschriftung("Insgesamt?", 2);
    expect(renderToStaticMarkup(inhalt({ x: 100, y: 50, index: 2 }) as ReactElement)).toContain(
      "Insgesamt?",
    );
    // An jedem anderen Punkt NICHTS: sonst stuende der Text vier Mal im Plot.
    expect(inhalt({ x: 100, y: 50, index: 1 })).toBeNull();
  });
});
