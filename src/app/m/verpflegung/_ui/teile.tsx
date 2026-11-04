/**
 * Kleine Bausteine des Verpflegungslagers — ohne `"use client"` und ohne antd, damit Server- und Client-Seiten sie
 * gleich benutzen (Falle 1, Falle 6).
 */
import type { ReactNode } from "react";
import { Statuschip, type Statuston } from "@/core/status/Statuschip";
import { ampelText, datumLang, restText, type MhdStatus } from "../_lib/mhd";
import s from "./verpflegung.module.css";

export type Farbe = "ok" | "gelb" | "rot" | "grau";

/** Der Statuschip aus `core/status` (Haarlinie); `rot` (abgelaufen, gesperrt) ist der Fehlerton. Er trägt immer einen Punkt. */
const TON: Record<Farbe, Statuston> = { ok: "ok", gelb: "warnung", rot: "fehler", grau: "neutral" };

export function Chip({ farbe, children }: { farbe: Farbe; children: ReactNode; punkt?: boolean }) {
  return <Statuschip ton={TON[farbe]}>{children}</Statuschip>;
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
