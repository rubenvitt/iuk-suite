import Link from "next/link";
import type { ReactNode } from "react";

import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import type { Statuston } from "@/core/status/Statuschip";
import { SCHRIFT } from "@/core/theme/schrift";

import tone from "@/core/status/statuschip.module.css";

import s from "./kennzahl.module.css";

/**
 * FREISTEHENDE KENNZAHLEN (Haarlinie, IDA-347, Etappe 3).
 *
 * Ersetzt die umrandeten Kacheln (`Card` + `Statistic`, im Lagerbuch `Card` + farbige 4px-Kante):
 * keine Kiste, nur eine Haarlinie ZWISCHEN den Zahlen, in einer Zeile, die umbricht. Die Linie am
 * Zeilenanfang schneidet `Kennzahlen` weg, also steht die erste Zahl jeder Zeile an der Menükante.
 *
 * DIE ZAHL TRÄGT IMMER TINTE (Falle 3: nie Rot auf einer Datenfläche). Den Befund trägt ein Punkt
 * vor der Beschriftung, im Ton des Statuschips (dessen Tonklasse setzt `--sc-ton`, eine Palette
 * für beide Bausteine); `neutral` und kein Ton zeichnen keinen Punkt —
 * ein grauer Punkt neben einem roten läse sich als vierte Stufe.
 *
 * `text` für Werte, die keine Zahl sind (Standort, Gerätetyp): 20 statt 30px, darf umbrechen.
 *
 * KEIN "use client", KEIN antd (Falle 1, Falle 6): reine Funktionen mit CSS-Modul; `next/link`
 * und `Icons8Ikone` sind in Server Components sicher (Falle 7).
 */
export function Kennzahlen({
  className,
  "aria-label": ariaLabel,
  children,
}: {
  className?: string;
  "aria-label"?: string;
  children?: ReactNode;
}) {
  return (
    <div className={[s.rahmen, className].filter(Boolean).join(" ")} aria-label={ariaLabel} role={ariaLabel ? "group" : undefined}>
      <div className={s.zeile} data-kennzahlen="">
        {children}
      </div>
    </div>
  );
}

export function Kennzahl({
  wert,
  label,
  ton,
  href,
  text = false,
}: {
  wert: ReactNode;
  label: ReactNode;
  ton?: Statuston;
  /** Verlinkt die ganze Kennzahl (auf ihre Liste); trägt dann ein Chevron. */
  href?: string;
  text?: boolean;
}) {
  const punkt = ton && ton !== "neutral" ? ton : undefined;
  const inhalt = (
    <>
      <span className={s.wert} data-kennzahl-wert="" style={text ? { ...SCHRIFT.unterTitel, lineHeight: 1.25 } : SCHRIFT.zahl}>
        {wert}
        {href ? <Icons8Ikone name="chevron-right" groesse={16} className={s.chevron} /> : null}
      </span>
      <span className={s.label} style={SCHRIFT.neben}>
        {punkt ? <span className={`${s.punkt} ${tone[punkt]}`} aria-hidden="true" /> : null}
        {label}
      </span>
    </>
  );
  return href ? (
    <Link href={href} className={`${s.kennzahl} ${s.link}`} data-kennzahl={ton ?? ""}>
      {inhalt}
    </Link>
  ) : (
    <div className={s.kennzahl} data-kennzahl={ton ?? ""}>
      {inhalt}
    </div>
  );
}
