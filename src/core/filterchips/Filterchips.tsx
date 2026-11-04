"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";

import s from "./filterchips.module.css";

/**
 * DIE FILTERCHIP-ZEILE ÜBER LISTEN (Haarlinie, IDA-347, Etappe 3).
 *
 * Ruhige Pillen mit Haarlinie statt `Segmented`/`Radio.Button`/`Tag.CheckableTag`; die gewählte
 * ist Tinte (die Bedienfarbe, nie Rot — Falle 3). Optional eine Zahl hinter der Beschriftung.
 *
 * - EINFACHWAHL (`wert`): `radiogroup` mit wanderndem Tabstopp — Tab springt in die Zeile auf die
 *   gewählte Pille, Pfeiltasten (auch Pos1/Ende) wählen die nächste.
 * - MEHRFACHWAHL (`mehrfach`, `werte`): `group` aus Umschaltknöpfen (`aria-pressed`), jeder im
 *   Tabzyklus, Leertaste/Eingabe schaltet.
 *
 * TIPPFLÄCHE 44px (Arbeitsdichte, Falle 4), die sichtbare Pille ist 32px — der Rest ist
 * unsichtbares Polster des Knopfes. Am Telefon bricht die Zeile nicht um, sondern scrollt in sich:
 * sie ist ihr eigener Scroller, die Seite bekommt keinen Überlauf.
 *
 * "use client": sie hat Ereignisse. Ein Wert für eine Server Component steht deshalb nicht hier
 * (Falle 6) — es gibt keinen.
 */
export type Filteroption<W extends string> = {
  wert: W;
  label: ReactNode;
  anzahl?: number;
};

type Gemeinsam<W extends string> = {
  optionen: readonly Filteroption<W>[];
  "aria-label": string;
  className?: string;
};

type Einfach<W extends string> = Gemeinsam<W> & {
  mehrfach?: false;
  /** `null`: keine Pille gewählt — etwa wenn ein Spaltenfilter daneben etwas anderes eingestellt hat. */
  wert: W | null;
  onChange: (wert: W) => void;
};

type Mehrfach<W extends string> = Gemeinsam<W> & {
  mehrfach: true;
  werte: readonly W[];
  onChange: (werte: W[]) => void;
};

export function Filterchips<W extends string>(props: Einfach<W> | Mehrfach<W>) {
  const { optionen, className } = props;
  const knoepfe = useRef<(HTMLButtonElement | null)[]>([]);

  const gewaehlt = (w: W) => (props.mehrfach ? props.werte.includes(w) : props.wert === w);

  function waehle(w: W) {
    if (props.mehrfach) {
      props.onChange(props.werte.includes(w) ? props.werte.filter((x) => x !== w) : [...props.werte, w]);
    } else if (props.wert !== w) {
      props.onChange(w);
    }
  }

  function taste(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    if (props.mehrfach) return;
    const n = optionen.length;
    const ziel = e.key === "ArrowRight" || e.key === "ArrowDown" ? (i + 1) % n
      : e.key === "ArrowLeft" || e.key === "ArrowUp" ? (i - 1 + n) % n
      : e.key === "Home" ? 0
      : e.key === "End" ? n - 1
      : -1;
    if (ziel < 0) return;
    e.preventDefault();
    knoepfe.current[ziel]?.focus();
    waehle(optionen[ziel].wert);
  }

  // Ohne gültige Wahl nimmt die erste Pille den Tabstopp, sonst wäre die Zeile per Tab unerreichbar.
  const tabstopp = props.mehrfach ? -1 : Math.max(0, optionen.findIndex((o) => o.wert === props.wert));

  return (
    <div
      role={props.mehrfach ? "group" : "radiogroup"}
      aria-label={props["aria-label"]}
      className={[s.reihe, className].filter(Boolean).join(" ")}
      data-filterchips={props.mehrfach ? "mehrfach" : "einfach"}
    >
      {optionen.map((o, i) => {
        const an = gewaehlt(o.wert);
        return (
          <button
            key={o.wert}
            ref={(el) => { knoepfe.current[i] = el; }}
            type="button"
            className={s.knopf}
            role={props.mehrfach ? undefined : "radio"}
            aria-checked={props.mehrfach ? undefined : an}
            aria-pressed={props.mehrfach ? an : undefined}
            tabIndex={props.mehrfach ? undefined : i === tabstopp ? 0 : -1}
            data-wert={o.wert}
            onClick={() => waehle(o.wert)}
            onKeyDown={(e) => taste(e, i)}
          >
            <span className={s.pille}>
              <span>{o.label}</span>
              {/* Das Leerzeichen trennt im Namen („Offen 3"); im Flex-Kasten nimmt es keinen Platz. */}
              {o.anzahl !== undefined ? <>{" "}<span className={s.anzahl}>{o.anzahl}</span></> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
