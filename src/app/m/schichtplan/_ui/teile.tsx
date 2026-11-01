/**
 * Kleine Bausteine der Planungsseite. Kein `"use client"`: nur reine Darstellung, die Client-Inseln
 * importieren sie (Falle 6 betrifft nur Werte aus einem `"use client"`-Modul).
 */
import type { ReactNode } from "react";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import type { Auswertung } from "../_lib/pruefung";
import type { EinheitDTO, PlanHelfer, PlanungDTO, Quali, SchichtDTO } from "../_lib/typen";
import s from "./schichtplan.module.css";

export type Ampel = "ok" | "gelb" | "rot" | "grau";

export function Chip({ ton, children, title }: { ton: Ampel | "quali" | "temp"; children: ReactNode; title?: string }) {
  return <span className={`${s.chip} ${s[ton]}`} title={title}>{children}</span>;
}

export function QualiChips({ qualis }: { qualis: readonly Quali[] }) {
  return (
    <span className={s.qualis}>
      {qualis.map((q) => <Chip key={q.kurz} ton="quali" title={q.name}>{q.kurz}</Chip>)}
    </span>
  );
}

export function Kpi({ titel, wert, ton = "grau", zusatz }: { titel: string; wert: ReactNode; ton?: Ampel; zusatz?: ReactNode }) {
  return (
    <div className={`${s.kpi} ${s[ton]}`}>
      <div className={s.kpiTitel}>{titel}</div>
      <div className={s.kpiWert}>{wert}</div>
      {zusatz ? <div className={s.neben}>{zusatz}</div> : null}
    </div>
  );
}

export const name = (h: Pick<PlanHelfer, "vorname" | "nachname">) => `${h.vorname} ${h.nachname}`;
export const einheitTitel = (e: Pick<EinheitDTO, "name" | "kenner">) => (e.kenner ? `${e.name} · ${e.kenner}` : e.name);
export const anforderungText = (e: Pick<EinheitDTO, "anforderungen">) => e.anforderungen.map((a) => `${a.anzahl}× ${a.quali.name}`).join(", ");

export function EinheitZeichen({ e }: { e: Pick<EinheitDTO, "art"> }) {
  return <Icons8Ikone name={e.art === "fahrzeug" ? "truck" : "marker"} groesse={18} />;
}

/** Ampel einer Schicht: rot bei Konflikt, gelb bei offenem Platz, sonst grün. */
export function schichtAmpel(schicht: SchichtDTO, a: Auswertung): Ampel {
  if ((a.jeSchicht.get(schicht.id) ?? []).length > 0) return "rot";
  if (a.luecken.some((l) => l.schichtId === schicht.id)) return "gelb";
  return "ok";
}

export function KpiReihe({ a, p }: { a: Auswertung; p: PlanungDTO }) {
  const offen = a.luecken.reduce((n, l) => n + l.fehlen, 0);
  const anteil = a.soll === 0 ? 0 : Math.round((a.ist / a.soll) * 100);
  return (
    <div className={s.kpis}>
      <Kpi titel="Besetzung" wert={`${anteil} %`} ton={a.soll > 0 && anteil === 100 ? "ok" : "gelb"} zusatz={`${a.ist} von ${a.soll} Plätzen`} />
      <Kpi titel="Offene Plätze" wert={offen} ton={offen === 0 ? "ok" : "gelb"} zusatz={`in ${a.luecken.length} Schichten`} />
      <Kpi titel="Konflikte" wert={a.konflikte.length} ton={a.konflikte.length === 0 ? "ok" : "rot"} zusatz="doppelt, Qualifikation, Dienstdauer" />
      <Kpi titel="Schichten" wert={p.schichten.length} zusatz={`${p.einheiten.length} Abschnitte und Fahrzeuge`} />
    </div>
  );
}
