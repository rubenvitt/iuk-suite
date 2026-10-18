import { cloneElement, isValidElement, type ReactNode } from "react";
import s from "./verwaltung.module.css";

/**
 * `rowSelection.renderCell` fuer Verwaltungstabellen, deren Auswahl am Tablet
 * mit dem Finger getroffen werden muss (IDA-238): antds eigenes Kreuzchen,
 * nur mit der Trefferflaeche der Arbeitsdichte am LABEL (`.auswahlKreuz`,
 * Begruendung dort). Kein eigenes Kreuzchen daneben — Zustand, Sperre und
 * Tastaturbedienung bleiben antds.
 *
 * Kein "use client": nur Client-Inseln rufen sie, und sie haelt keinen Zustand.
 */
export function auswahlZelle(
  _gewaehlt: boolean,
  _zeile: unknown,
  _index: number,
  kreuz: ReactNode,
): ReactNode {
  if (!isValidElement<{ className?: string }>(kreuz)) return kreuz;
  const klassen = [kreuz.props.className, s.auswahlKreuz].filter(Boolean).join(" ");
  return cloneElement(kreuz, { className: klassen });
}
