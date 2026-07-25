"use client";

import type { ReactElement } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ampelStufe, notenSatz } from "../_lib/noten";
import { T } from "./typo";

/**
 * DER NOTENVERLAUF (Entwurf §3.3, §5.3) — recharts DIREKT, modul-lokal.
 *
 * WARUM NICHT `core/charts/LineChart` (§5.3, wortgenau): der dort faerbt mit
 * `token.colorPrimary` (= DRK-Rot, und Rot gehoert im Modul `feedback` allein
 * der Note 6 bzw. der Marke — Farb-Klausel §4.9) und kennt weder eine
 * umgekehrte Achse noch `ReferenceArea`-Kinder noch farbige Punkte je Wert. Vier
 * fehlende Faehigkeiten, deren Aufrufer ALLE in diesem Modul liegen. Also bleibt
 * `core/charts` fuer Nicht-Noten-Daten anderer Module unveraendert nutzbar, und
 * das Notendiagramm steht hier. Braucht spaeter ein ZWEITES Modul eine
 * invertierte Achse, ist `reversed` die eine Prop, die man dann — und erst dann —
 * nach core hebt.
 *
 * DIE EINE ZUSAGE, DIE HIER EIN SACHFEHLER WAERE: die deutsche Schulnote ist
 * INVERTIERT. 1 ist die beste Note. Ein Diagramm, in dem eine 6 hoeher steht als
 * eine 1, behauptet das Gegenteil der Wahrheit. Deshalb:
 *
 * 1. `YAxis reversed` — Note 1 oben.
 * 2. Domain FEST `[1, 6]` mit allen sechs Ticks. Ein auf die Daten gespanntes
 *    Domain macht aus 2,0 → 2,1 einen Absturz; die Steigung wuerde luegen.
 * 3. „1 OBEN = BESSER" steht DAUERHAFT im Plot. Ohne diese Beschriftung ist jede
 *    Notenkurve zweideutig — und niemand liest eine Legende, bevor er eine
 *    Steigung deutet.
 *
 * Die Farben kommen als `--fb-*` / `--note-*` aus `feedback.css` und NICHT aus
 * `theme.useToken()`: antds Variablen liegen auf der Scope-Klasse seiner eigenen
 * Komponenten, ein SVG sieht sie nie (§4.10). Nebenwirkung, die wir wollen: die
 * Komponente braucht keinen Hook und bleibt eine reine Funktion.
 */

export type NotenVerlaufPunkt = {
  /** Achsenbeschriftung, z. B. „2026-04". */
  label: string;
  /** Der Schulnoten-Ø (`avgSchulnote`, §4.12) — `null` reisst die Linie auf. */
  note: number | null;
};

export type NotenVerlaufProps = {
  punkte: NotenVerlaufPunkt[];
  /** 320 laut §3.3; mobil 240. */
  hoehe?: number;
};

const NOTEN = [1, 2, 3, 4, 5, 6] as const;

export function NotenVerlauf({ punkte, hoehe = 320 }: NotenVerlaufProps) {
  const werte = punkte.filter((p) => p.note !== null);

  /*
   * §4.3: „Weniger als zwei ausgewertete Abende — fuer einen Verlauf zu frueh."
   * statt Diagramm, kein leeres Achsenkreuz. Ein Achsenkreuz ohne Linie liest
   * sich als „Daten weg", nicht als „noch zu frueh".
   */
  if (werte.length < 2) {
    return (
      <p style={{ ...T.meta, margin: 0, minHeight: 48 }}>
        Weniger als zwei ausgewertete Abende — für einen Verlauf zu früh.
      </p>
    );
  }

  return (
    <div style={{ position: "relative", width: "100%", height: hoehe }}>
      {/*
       * Der Richtungshinweis liegt als eigenes Markup UEBER dem Plot und nicht
       * als recharts-`label`: so ist er echter Text (vorlesbar, durchsuchbar,
       * kopierbar) und ueberlebt auch das Rendern ohne gemessene Groesse.
       */}
      <span
        style={{
          ...T.kicker,
          position: "absolute",
          top: 4,
          left: 48,
          zIndex: 1,
          pointerEvents: "none",
        }}
      >
        1 OBEN = BESSER
      </span>
      <ResponsiveContainer width="100%" height={hoehe}>
        <LineChart data={punkte} margin={{ top: 24, right: 12, bottom: 4, left: 0 }}>
          {/*
           * Sechs textfreie Baender als Diagrammgrund (§4.11): eine Toenung
           * traegt NIE Text — die Notenfarbe auf ihrer eigenen Toenung erreicht
           * nur ~2:1. Jedes Band deckt genau EINE Note ab (n ± 0,5), damit der
           * Tick auf der Bandmitte sitzt.
           */}
          {NOTEN.map((n) => (
            <ReferenceArea
              key={n}
              y1={n - 0.5}
              y2={n + 0.5}
              fill={`var(--note-tint-${n})`}
              fillOpacity={1}
              ifOverflow="hidden"
            />
          ))}
          <CartesianGrid vertical={false} stroke="var(--fb-split)" />
          <XAxis
            dataKey="label"
            stroke="var(--fb-line)"
            tick={{ fill: "var(--fb-muted)", fontSize: 12 }}
          />
          <YAxis
            reversed
            domain={[1, 6]}
            ticks={[1, 2, 3, 4, 5, 6]}
            stroke="var(--fb-line)"
            tick={{ fill: "var(--fb-muted)", fontSize: 12 }}
            width={40}
          />
          <Tooltip formatter={(wert) => notenText(wert)} />
          <Line
            dataKey="note"
            stroke="var(--fb-ink)"
            strokeWidth={2}
            connectNulls={false}
            dot={notenPunkt}
            activeDot={{ r: 5, fill: "var(--fb-ink)" }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Jeder Punkt traegt die Farbe SEINES Wertes (§3.3) — nicht die der Linie. Damit
 * ist ein einzelner schlechter Abend auch ohne Achsenblick erkennbar, und der
 * Farbsprung von 2,4 auf 2,5 folgt derselben Schwelle wie Pille und Spur
 * (`ampelStufe`, die einzige Rundungsregel des Moduls).
 *
 * Ohne Wert KEIN Punkt: ein Punkt auf der Nulllinie saesse auf einer Note, die
 * niemand gegeben hat.
 */
function notenPunkt(props: {
  cx?: number;
  cy?: number;
  payload?: { note?: number | null };
}): ReactElement | null {
  const { cx, cy, payload } = props;
  const note = payload?.note;
  if (cx === undefined || cy === undefined || note === null || note === undefined) return null;
  return <circle cx={cx} cy={cy} r={4} fill={`var(--note-${ampelStufe(note)})`} />;
}

/**
 * „2,4 befriedigend" im Tooltip — Ziffer UND Wort, wie jede Notenanzeige. Der
 * Satz kommt aus `_lib/noten.ts` (`notenSatz`); eine hier formulierte Fassung
 * waere eine zweite Schwellentabelle.
 */
function notenText(wert: unknown): string {
  if (typeof wert !== "number" || !Number.isFinite(wert)) return "—";
  return notenSatz(wert);
}
