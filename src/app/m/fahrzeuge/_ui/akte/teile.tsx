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

/**
 * Engeres Zellpolster für die beiden Tabellen der Akte (Theme der Suite: 12px je Seite). Als Token über
 * `ConfigProvider`, nicht als CSS gegen antd (Falle 5): bei 1280px stehen so acht Angaben der Tafel und der
 * nächste Termin der Akte ohne waagerechtes Scrollen da. Ein reiner Wert, kein `"use client"` (Falle 6).
 */
export const ENGE_ZELLEN = { components: { Table: { cellPaddingInline: 8 } } } as const;

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

/**
 * Für eine Prüfart ohne Eintrag. „entfällt“ nur, wo sie wirklich nicht gilt (ein Anhänger ohne UVV und Service);
 * eine HU braucht jedes Fahrzeug, dort und bei Kraftfahrzeugen heißt die Lücke „nicht erfasst“ (`ohneEintrag`).
 */
export function Entfaellt({ className, text = "entfällt" }: { className?: string; text?: string }) {
  return <span className={className ?? `${s.neben} ${s.klein}`}>{text}</span>;
}

/** Das Wort für eine fehlende HU, UVV oder Service-Prüfung. */
export function ohneEintrag(art: "HU" | "UVV" | "Service" | "Weitere", anhaenger: boolean): string {
  if (art === "Weitere") return "keine";
  return art === "HU" || !anhaenger ? "nicht erfasst" : "entfällt";
}
