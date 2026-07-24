"use client";

import { Fragment, useState, type CSSProperties } from "react";
import { NOTEN_DUNKEL, NOTEN_HELL, NOTEN_WORT } from "../../_lib/noten";
import { isRatingType, ratingScale, type Question } from "../../_lib/questions";
import type { SubmitResult } from "../../actions";
import s from "./zettel.module.css";

/**
 * Der Zettel — die Zeugnis-Matrix (Entwurf §3.2 Punkt 3–4, §3.6, §3.10).
 *
 * WAS HIER ERSETZT WIRD: acht Reihen mit sechs grauen Sternen. Sechs Sterne
 * lesen sich universell als Bestnote; gemeint war die deutsche Schulnote, also
 * "ungenuegend". Wer nicht liest, bewertet das Gegenteil — und hinterher ist
 * nicht mehr unterscheidbar, welche Antworten invertiert gemeint waren. Die
 * Datenschicht war immer richtig (`type: "schulnote"`), nur die Darstellung
 * hat gelogen.
 *
 * DIE RICHTUNG TRAEGT VIER UNABHAENGIGE KANAELE, keiner davon Farbe allein:
 *   1. der Legendenstreifen, GENAU EINMAL, im selben 6-Spalten-Raster wie die
 *      Chips darunter,
 *   2. der achromatische Tonwertkeil, der nach rechts dunkelt (CSS),
 *   3. die Ankerwoerter unter der ersten Zeile ("1 sehr gut" / "6 ungenuegend"),
 *   4. die Ziffer selbst — die Schulnote ist Allgemeinwissen.
 * Farbe entsteht ERST durch Auswahl, hoechstens einmal pro Zeile: maximal acht
 * farbige Chips statt 48 Flaechen (sonst waere die Seite ein Flickenteppich).
 *
 * DIE NOTENFARBEN KOMMEN AUS `_lib/noten.ts` und werden dem Chip als
 * Inline-Variablen gereicht. Warum nicht direkt ins CSS: dann gaebe es zwei
 * Paletten (hier und im Admin-Bereich), die beim naechsten Nachjustieren
 * auseinanderlaufen — und die Kontrast-/Monotonie-Zusicherung haengt an genau
 * einer Definition.
 *
 * `<form action={action}>` bekommt die Server Action DIREKT, nicht ueber einen
 * Client-Wrapper: ein Wrapper waere keine serialisierbare Action mehr und die
 * Abgabe OHNE JavaScript — die Kernzusage des Entwurfs (§3.11) — waere still
 * kaputt, ohne dass Typecheck oder Build es merken. Der Preis in dieser Stufe:
 * ein `{ ok: false }` der Action bleibt unsichtbar. Die Inline-Meldung dafuer
 * (und die zwei Absende-Knoepfe, Notenuebersicht, Navigator) baut Task 13.
 */
export interface ZettelProps {
  questions: Question[];
  /** Stufenzahl der Skala: 6 (`schulnote`) oder 5 (importierte `stars`). */
  scale: number;
  action: (fd: FormData) => Promise<SubmitResult | void>;
  /** Schluessel des Entwurfsspeichers (Task 12 nutzt ihn). */
  tokenHash: string;
}

/** Sektions-Kicker aus §3.2 Punkt 4 — die Fragereihenfolge bleibt unangetastet. */
const SEKTIONEN = ["01 DER ABEND", "02 ABLAUF & VORBEREITUNG", "03 DU UND DER ABEND"] as const;

/** Grenzen der drei Sektionen: q1–q3 · q4–q6 · q7–q8 (Rest in die letzte). */
const SEKTIONSGRENZEN = [3, 6] as const;

/**
 * Verzug der Aufbau-Choreografie in ms (§3.5): Kopf 0 (in `page.tsx`), Legende
 * 60, Sektion 1–3 120/180/240 — Freitexte 300 und Abschluss 360 folgen in Task
 * 12/13.
 */
function verzug(ms: number): CSSProperties {
  return { animationDelay: `${ms}ms` };
}

/**
 * Die Farben einer Stufe als Inline-Variablen. `--note-hell`/`--note-dunkel`
 * liegen BEIDE am Element, weil der Dunkelmodus an `[data-theme]` haengt und
 * nicht an `prefers-color-scheme` — CSS waehlt dann aus, ohne dass der Server
 * den Modus kennen muss.
 */
function notenVariablen(stufe: number, scale: number): CSSProperties {
  const i = rampenIndex(stufe, scale);
  return {
    "--note-hell": mischung(NOTEN_HELL, i),
    "--note-dunkel": mischung(NOTEN_DUNKEL, i),
  } as CSSProperties;
}

/**
 * Bei fuenf Stufen wird die Sechser-Rampe abgetastet: 1, 2, 3½, 5, 6 (§3.6).
 * Halbe Indizes werden gemischt, damit die Luminanz auch hier streng monoton
 * faellt — DAS ist der Kanal, der Graustufen und Rot-Gruen-Blindheit uebersteht.
 */
function rampenIndex(stufe: number, scale: number): number {
  if (scale !== 5) return stufe - 1;
  return [0, 1, 2.5, 4, 5][stufe - 1];
}

function mischung(palette: readonly string[], index: number): string {
  const unten = Math.floor(index);
  if (unten === index) return palette[unten];
  return `color-mix(in srgb, ${palette[unten]} 50%, ${palette[unten + 1]})`;
}

/** Notenwort einer Stufe. Bei fuenf Stufen endet die Skala bei "mangelhaft". */
function wort(stufe: number): string {
  return NOTEN_WORT[stufe - 1];
}

export function Zettel(props: ZettelProps) {
  const { questions, scale, action } = props;
  const [noten, setNoten] = useState<Record<string, number>>({});

  const notenfragen = questions.filter((q) => isRatingType(q.type));
  const sektionen = [
    notenfragen.slice(0, SEKTIONSGRENZEN[0]),
    notenfragen.slice(SEKTIONSGRENZEN[0], SEKTIONSGRENZEN[1]),
    notenfragen.slice(SEKTIONSGRENZEN[1]),
  ];

  /*
   * Die Action gibt ein Ergebnis zurueck (`SubmitResult`), `<form action>`
   * typisiert nur `void`. Zur Laufzeit verwirft React den Rueckgabewert
   * geraeuschlos — die Umgehung ist deshalb eine Typ-Umschreibung und KEIN
   * Wrapper: eine Pfeilfunktion um die Action herum verliert deren
   * Serialisierungs-Kennung, und damit waere die Abgabe ohne JavaScript still
   * kaputt. Task 13 holt das Ergebnis ueber den Weg ab, der es auch anzeigt.
   */
  const formAction = action as unknown as (fd: FormData) => Promise<void>;

  return (
    <form action={formAction} className={s.form}>
      <Legende scale={scale} />
      {sektionen.map((fragen, si) =>
        fragen.length === 0 ? null : (
          <section
            key={SEKTIONEN[si]}
            className={`${s.sektion} ${s.aufbau}`}
            style={verzug(120 + si * 60)}
          >
            <p className={s.sektionKicker}>{SEKTIONEN[si]}</p>
            {fragen.map((q) => (
              <Notenzeile
                key={q.id}
                frage={q}
                nummer={notenfragen.indexOf(q) + 1}
                gewaehlt={noten[q.id]}
                onWahl={(stufe) => setNoten((alt) => ({ ...alt, [q.id]: stufe }))}
              />
            ))}
          </section>
        ),
      )}
      <button type="submit" className={s.knopf}>
        Rückmeldung absenden
      </button>
    </form>
  );
}

/**
 * Der Legendenstreifen. GENAU EINMAL auf der Seite und im identischen
 * 6-Spalten-Raster wie die Chips darunter — achtmal wiederholt waere er ein
 * Balkendiagramm ohne Daten.
 */
function Legende({ scale }: { scale: number }) {
  const stufen = Array.from({ length: scale }, (_, i) => i + 1);
  return (
    <div className={`${s.legende} ${s.aufbau}`} style={verzug(60)} data-legende="">
      <div className={s.streifen} data-stufen={scale} aria-hidden="true">
        {stufen.map((stufe) => (
          <span
            key={stufe}
            className={s.segment}
            data-segment=""
            style={notenVariablen(stufe, scale)}
          />
        ))}
      </div>
      <div className={s.woerter} data-stufen={scale}>
        {stufen.map((stufe) => (
          <span key={stufe} className={s.wort}>
            {wort(stufe)}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Eine Zeile der Matrix. `fieldset` + versteckte `legend` machen daraus eine
 * ECHTE Radiogruppe: ein Tabstop pro Frage (acht statt 48), Pfeiltasten waehlen
 * nativ, und der Screenreader liest "… Note 2 – gut, 2 von 6".
 *
 * Die Frage steht ZWEIMAL im Markup und wird trotzdem genau einmal angekuendigt:
 * die `legend` ist nur visuell versteckt (per `clip-path`, NICHT `display:none`
 * — das wuerde sie aus dem Barrierefreiheitsbaum loeschen und die Gruppe
 * namenlos machen), der sichtbare Fragetext traegt `aria-hidden`.
 */
function Notenzeile({
  frage,
  nummer,
  gewaehlt,
  onWahl,
}: {
  frage: Question;
  nummer: number;
  gewaehlt: number | undefined;
  onWahl: (stufe: number) => void;
}) {
  // `switch` auf den Fragetyp statt Improvisieren: `stars` (importierte
  // Alt-Umfragen) hat fuenf Stufen, `schulnote` sechs.
  const stufenzahl = ratingScale(frage.type);
  const stufen = Array.from({ length: stufenzahl }, (_, i) => i + 1);
  return (
    <fieldset className={s.zeile}>
      <legend className={s.srOnly}>{frage.text}</legend>
      <div className={s.reihe}>
        <div className={s.links} aria-hidden="true">
          <span className={s.nr}>{String(nummer).padStart(2, "0")}</span>
          <p className={s.frage}>{frage.text}</p>
        </div>
        <div className={s.rechts}>
          <div className={s.chips} data-stufen={stufenzahl}>
            {stufen.map((stufe) => (
              <Fragment key={stufe}>
                {/*
                  `required` an JEDER Option ist das Netz ohne JavaScript: der
                  Browser springt feldweise zur ersten Luecke, ohne Serverweg
                  und ohne Datenverlust. Mit JavaScript uebernimmt in Task 13
                  der gestaltete Lueckenspringer.
                */}
                <input
                  type="radio"
                  id={`${frage.id}-${stufe}`}
                  name={frage.id}
                  value={stufe}
                  required
                  className={s.srOnly}
                  onChange={() => onWahl(stufe)}
                />
                <label
                  htmlFor={`${frage.id}-${stufe}`}
                  aria-label={`Note ${stufe} – ${wort(stufe)}`}
                  className={s.chip}
                  style={notenVariablen(stufe, stufenzahl)}
                >
                  {stufe}
                </label>
              </Fragment>
            ))}
          </div>
          {nummer === 1 ? (
            <div className={s.anker} data-anker="" aria-hidden="true">
              <span>1 {wort(1)}</span>
              <span>
                {stufenzahl} {wort(stufenzahl)}
              </span>
            </div>
          ) : null}
          {gewaehlt === undefined ? null : (
            <span className={s.fussnote} data-fussnote="">
              {gewaehlt} · {wort(gewaehlt)}
            </span>
          )}
        </div>
      </div>
    </fieldset>
  );
}
