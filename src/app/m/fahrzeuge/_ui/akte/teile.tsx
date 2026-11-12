/**
 * Kleine Bausteine von Tafel, Hallentafel und Akte — ohne `"use client"` und ohne antd, damit die
 * Server-Seite der Hallentafel und die Client-Inseln sie gleich benutzen (Falle 1, Falle 6).
 */
import type { ReactNode } from "react";
import { Statuschip, type Statuston } from "@/core/status/Statuschip";
import { STUFE_WORT, type Stufe } from "../../_lib/akte/typen";
import s from "./akte.module.css";

/** `ueberfaellig` ist der Fehlerton: ein echter Missstand, keine Wertung (Falle 3). `offen` bleibt ohne Befund. */
export const STUFE_TON: Record<Stufe, Statuston> = { ueberfaellig: "fehler", bald: "warnung", ok: "ok", offen: "neutral" };

/** Die Klasse, die `--fz-ton` setzt (Kachelpunkt, Kante der Hallentafel). */
export const STUFE_KLASSE: Record<Stufe, string> = { ueberfaellig: s.tonRot, bald: s.tonGelb, ok: s.tonOk, offen: s.tonGrau };

/** Der Chip einer Stufe; ohne Kinder steht ihr Wort („überfällig“, „bald“, „in Ordnung“, „nicht erfasst“). */
export function StufenChip({ stufe, className, children }: { stufe: Stufe; className?: string; children?: ReactNode }) {
  return <Statuschip ton={STUFE_TON[stufe]} className={className}>{children ?? STUFE_WORT[stufe]}</Statuschip>;
}

/** Chip mit leiser Zeile darunter — die Zelle der Tafel. */
export function StandZelle({ stufe, text, unter, chipKlasse, unterKlasse }: { stufe: Stufe; text: ReactNode; unter?: ReactNode; chipKlasse?: string; unterKlasse?: string }) {
  return (
    <div className={s.zelle}>
      <StufenChip stufe={stufe} className={chipKlasse}>{text}</StufenChip>
      {unter ? <span className={unterKlasse ?? s.unter}>{unter}</span> : null}
    </div>
  );
}

/** Für eine Prüfart, die das Fahrzeug nicht hat (ein Anhänger ohne UVV). */
export function Entfaellt({ className }: { className?: string }) {
  return <span className={className ?? `${s.neben} ${s.klein}`}>entfällt</span>;
}
