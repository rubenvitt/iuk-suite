"use client";

import { zeitpunktText } from "../zeit";
import s from "./ansichten.module.css";
import { chipText, chipTon, kurz, pruefSatz, type Kettenzustand } from "./modell";
import { Zeichen } from "./Zeichen";

/** Der Anker, wie er in der Exportdatei steht (`Exportinhalt.anker`); `gemeldetAm` ist ISO mit Offset. */
export interface Ankerangabe { block: number; hash: string; gemeldetAm: string }

/**
 * Ein Anker braucht eine Zeitzone, um `gemeldetAm` zu formatieren — deshalb ist `zeitzone`
 * genau dann Pflicht, wenn ein Anker kommt. Ohne Anker bleibt die Ansicht zeitzonenfrei.
 */
export type KettenpruefungProps = { zustand: Kettenzustand; mitSatz?: boolean } & (
  | { anker?: null; zeitzone?: string }
  | { anker: Ankerangabe; zeitzone: string }
);

/**
 * Chip mit dem Prüfergebnis, optional der erklärende Satz der Vorlage. Der Anker aus einer
 * Datei ist nur SELBST GEMELDET: Wer die Datei baut, schreibt ihn hinein. Die Zeile sagt
 * deshalb ausdrücklich „laut Datei“ und „nicht von der Suite bestätigt“ — den Abgleich mit
 * dem Anker der Suite gibt es erst mit Stufe 5.
 */
export function Kettenpruefung(props: KettenpruefungProps) {
  const { zustand, mitSatz = false } = props;
  const ton = chipTon(zustand);
  const satz = mitSatz ? pruefSatz(zustand) : "";
  return (
    <div className={`${s.wurzel} ${s.pruefung}`} data-kettenpruefung="">
      <span className={s.chip} data-ton={ton}>
        {ton === "ok" && <Zeichen name="haken" groesse={12} />}
        {ton === "rot" && <Zeichen name="warnung" groesse={12} />}
        {chipText(zustand)}
      </span>
      {satz && <p className={s.satz} data-satz="">{satz}</p>}
      {props.anker && (
        <p className={s.anker} data-anker="">
          {`Anker laut Datei: Block ${props.anker.block}, gemeldet am ${zeitpunktText(props.anker.gemeldetAm, props.zeitzone)} (#${kurz(props.anker.hash)}) — nicht von der Suite bestätigt`}
        </p>
      )}
    </div>
  );
}
