/**
 * Kleine Bausteine des Verpflegungslagers — ohne `"use client"` und ohne antd, damit Server- und Client-Seiten sie
 * gleich benutzen (Falle 1, Falle 6).
 */
import type { ReactNode } from "react";
import { ampelText, datumLang, restText, type MhdStatus } from "../_lib/mhd";
import s from "./verpflegung.module.css";

export type Farbe = "ok" | "gelb" | "rot" | "grau";

export function Chip({ farbe, children, punkt }: { farbe: Farbe; children: ReactNode; punkt?: boolean }) {
  return <span className={`${s.chip} ${s[farbe]}`}>{punkt && <span className={s.punkt} aria-hidden />}{children}</span>;
}

/** Die Ampel neben dem Datum. Bedeutung nie allein über Farbe: das Wort steht immer dabei. */
export function AmpelChip({ status, lang }: { status: MhdStatus; lang?: boolean }) {
  return <Chip farbe={status.ampel} punkt>{lang ? (status.gesperrt ? `gesperrt · ${restText(status.tage)}` : restText(status.tage)) : ampelText(status)}</Chip>;
}

export function Mhd({ mhd, status }: { mhd: string; status: MhdStatus }) {
  return (
    <span className={s.reihe}>
      <span className={s.mhd}>{datumLang(mhd)}</span>
      <AmpelChip status={status} />
    </span>
  );
}

export function Kicker({ children }: { children: ReactNode }) {
  return <div className={s.kicker}>{children}</div>;
}
