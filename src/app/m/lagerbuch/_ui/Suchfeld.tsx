"use client";

import { Input } from "antd";
import { Ikone } from "./ikonen";

/**
 * Gemeinsames Freitextfeld fuer die Listen. `type="search"` stellt die
 * benoetigte searchbox-Rolle bereit; ein zusaetzlicher Absendeknopf waere bei
 * sofortiger Filterung beziehungsweise debounced Navigation irrefuehrend.
 */
export function Suchfeld({
  wert,
  onWert,
  platzhalter,
  breite = 280,
  onEnter,
}: {
  wert: string;
  onWert: (wert: string) => void;
  platzhalter: string;
  breite?: number;
  /**
   * Optional (IDA-237, Inventur): Enter springt zum einzigen Treffer. Die
   * Filterung selbst bleibt sofort bzw. entprellt — Enter ist ein Sprung,
   * kein Absenden.
   */
  onEnter?: (wert: string) => void;
}) {
  return (
    <Input
      type="search"
      value={wert}
      onChange={(ereignis) => onWert(ereignis.target.value)}
      onPressEnter={onEnter ? (ereignis) => onEnter(ereignis.currentTarget.value) : undefined}
      placeholder={platzhalter}
      aria-label={platzhalter}
      prefix={<Ikone name="lupe" groesse={16} />}
      allowClear
      style={{ maxWidth: breite }}
      styles={wert === "" ? TREFFERFLAECHE_LEER : TREFFERFLAECHE}
    />
  );
}

/**
 * IDA-238 — DIE TREFFERFLAECHEN DER ARBEITSDICHTE (44 px, Falle 4) AUCH IM
 * INNEREN. Mit `prefix` und `allowClear` rendert antd einen Rahmen um das
 * eigentliche `input`; der Rahmen ist 44 px hoch, das Eingabefeld darin nur so
 * hoch wie seine Zeile (25 px) und der Leeren-Knopf 12 x 12 px.
 * `e2e/lagerbuch-mobil.spec.ts` („jede Zeilenaktion ist mindestens 44 x 44 px")
 * misst genau diese beiden. Ueber antds Semantik-Slots statt ueber CSS gegen
 * `.ant-*`-Namen (Falle 5, Falle 20): der Rahmen verliert sein Polster, Feld
 * und Knopf werden 44 px hoch und reichen je 1 px unter den Rand — so bleibt
 * der Rahmen bei 44 px, statt mit seinem Rand auf 46 zu wachsen.
 *
 * ⚠️ OHNE TEXT IST DER KNOPF `display: none`, nicht nur unsichtbar: antd
 * blendet ihn per `visibility` aus, er naehme also auch leer seine 44 px
 * Breite dem Platzhalter weg. Dieselbe Bauform bleibt dabei stehen — das Feld
 * wird beim ersten Zeichen nicht neu eingehaengt und verliert den Fokus nicht.
 */
const TREFFERFLAECHE = {
  root: { paddingBlock: 0 },
  input: { minHeight: 44, marginBlock: -1 },
  clear: {
    minWidth: 44,
    minHeight: 44,
    marginBlock: -1,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },
} as const;

const TREFFERFLAECHE_LEER = { ...TREFFERFLAECHE, clear: { display: "none" } } as const;
