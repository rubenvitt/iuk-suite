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
    />
  );
}
