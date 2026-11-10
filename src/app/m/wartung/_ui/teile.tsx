/**
 * Kleine Bausteine der Gerätewartung — ohne `"use client"` und ohne antd, damit Server- und Client-Seiten sie
 * gleich benutzen (Falle 1, Falle 6).
 */
import type { ReactNode } from "react";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import { Statuschip, type Statuston } from "@/core/status/Statuschip";
import { artIkone } from "../_lib/eingabe";
import { datum, STUFE_TEXT, ZUSTAND_TEXT, type FristStand, type Stufe, type Zustand } from "../_lib/fristen";
import s from "./wartung.module.css";

export type Farbe = "ok" | "gelb" | "rot" | "grau";

/** Der Statuschip aus `core/status`; `rot` (überfällig, defekt) ist der Fehlerton. */
const TON: Record<Farbe, Statuston> = { ok: "ok", gelb: "warnung", rot: "fehler", grau: "neutral" };

export function Chip({ farbe, children }: { farbe: Farbe; children: ReactNode }) {
  return <Statuschip ton={TON[farbe]}>{children}</Statuschip>;
}

export const STUFE_FARBE: Record<Stufe, Farbe> = { ueberfaellig: "rot", bald: "gelb", ok: "ok" };
export const ZUSTAND_FARBE: Record<Zustand, Farbe> = { ok: "ok", mangel: "gelb", defekt: "rot" };

export function FristChip({ f }: { f: Pick<FristStand, "stufe"> }) {
  return <Chip farbe={STUFE_FARBE[f.stufe]}>{STUFE_TEXT[f.stufe]}</Chip>;
}

/** Wort und Farbe des Zustands, ohne Abweichung je Stelle (IDA-381). */
export function ZustandChip({ z }: { z: Zustand }) {
  return <Chip farbe={ZUSTAND_FARBE[z]}>{ZUSTAND_TEXT[z]}</Chip>;
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

/**
 * `leise`: ohne Versalien, wie `SCHRIFT.kicker` — die Haarlinie der Verwaltungsflächen (`docs/design/README.md`,
 * „Haarlinie“: keine Versalien; IDA-381). Ohne `leise` bleibt der versale Kicker der Telefonseiten am Gerät,
 * die die Regel nicht deckt.
 */
export function Kicker({ children, className, leise }: { children: ReactNode; className?: string; leise?: boolean }) {
  return <div className={[s.kicker, leise ? s.kickerLeise : "", className ?? ""].filter(Boolean).join(" ")}>{children}</div>;
}

export const stundenText = (h: number | null): string => (h === null ? "—" : `${h.toLocaleString("de-DE")} h`);

export { datum };
export const groesseText = (bytes: number): string =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024)).toLocaleString("de-DE")} KB` : `${(bytes / 1024 / 1024).toLocaleString("de-DE", { maximumFractionDigits: 1 })} MB`;
