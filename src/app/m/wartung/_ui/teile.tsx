/**
 * Kleine Bausteine der Gerätewartung — ohne `"use client"` und ohne antd, damit Server- und Client-Seiten sie
 * gleich benutzen (Falle 1, Falle 6).
 */
import type { ReactNode } from "react";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import { artIkone } from "../_lib/eingabe";
import { datum, STUFE_TEXT, ZUSTAND_TEXT, type FristStand, type Stufe, type Zustand } from "../_lib/fristen";
import s from "./wartung.module.css";

export type Farbe = "ok" | "gelb" | "rot" | "grau";

export function Chip({ farbe, children }: { farbe: Farbe; children: ReactNode }) {
  return <span className={`${s.chip} ${s[farbe]}`}>{children}</span>;
}

export const STUFE_FARBE: Record<Stufe, Farbe> = { ueberfaellig: "rot", bald: "gelb", ok: "ok" };
export const ZUSTAND_FARBE: Record<Zustand, Farbe> = { ok: "ok", mangel: "gelb", defekt: "rot" };

export function FristChip({ f }: { f: Pick<FristStand, "stufe"> }) {
  return <Chip farbe={STUFE_FARBE[f.stufe]}>{STUFE_TEXT[f.stufe]}</Chip>;
}

export function ZustandChip({ z, text }: { z: Zustand; text?: string }) {
  return <Chip farbe={ZUSTAND_FARBE[z]}>{text ?? ZUSTAND_TEXT[z]}</Chip>;
}

export function OrtText({ ortArt, ort }: { ortArt: "lager" | "fahrzeug"; ort: string }) {
  return (
    <span className={s.reihe} style={{ display: "inline-flex", gap: 4 }}>
      <Icons8Ikone name={ortArt === "fahrzeug" ? "truck" : "warehouse"} groesse={16} /> {ort}
    </span>
  );
}

export function ArtZeichen({ ikone, groesse = 20 }: { ikone: string; groesse?: number }) {
  return <Icons8Ikone name={artIkone(ikone)} groesse={groesse} />;
}

export function Kicker({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`${s.kicker} ${className ?? ""}`}>{children}</div>;
}

export const stundenText = (h: number | null): string => (h === null ? "—" : `${h.toLocaleString("de-DE")} h`);

export { datum };
