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
}: {
  wert: string;
  onWert: (wert: string) => void;
  platzhalter: string;
  breite?: number;
}) {
  return (
    <Input
      type="search"
      value={wert}
      onChange={(ereignis) => onWert(ereignis.target.value)}
      placeholder={platzhalter}
      aria-label={platzhalter}
      prefix={<Ikone name="lupe" groesse={16} />}
      allowClear
      style={{ maxWidth: breite }}
    />
  );
}
