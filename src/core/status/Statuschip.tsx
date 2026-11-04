import type { ReactNode } from "react";

import s from "./statuschip.module.css";

/**
 * DER STATUSCHIP DER VERWALTUNGSFLÄCHEN (Haarlinie, IDA-347, Etappe 3).
 *
 * Vorbild ist der Chip aus `gemeinschaft` (Betreiberentscheidung 2026-11-04): ruhige Pille, Text in
 * der Tonfarbe. Neu ist die Haarlinie: eine feine Kontur und eine weiche, aus dem Ton gemischte
 * Fläche statt einer satten — und ein Punkt (oder ein Zeichen) vor dem Text.
 *
 * DIE TÖNE sind Bedeutung, keine Farbwahl:
 * - `neutral` — kein Befund (inaktiv, vorbei, Kategorie). Nur Kontur, keine Fläche.
 * - `info` — laufend, in Arbeit, verschickt.
 * - `ok` — erledigt, gültig, besetzt.
 * - `warnung` — bald fällig, offen, wartet auf jemanden.
 * - `fehler` — abgelaufen, defekt, fehlgeschlagen. ROT NUR HIER (Falle 3): nie für eine fachliche
 *   Wertung wie eine Schulnote, und nie als Fläche einer Zahl.
 *
 * KEIN "use client", KEIN antd, KEIN Hook: eine reine Funktion auf ein `<span>` mit CSS-Modul —
 * aus einer Server Component wie aus einer `render`-Funktion von `Datentabelle` nutzbar (Falle 1,
 * Falle 6, Falle 9). Die Farben stehen als eigene Variablen AM CHIP (Falle 2), also auch in einem
 * Portal (Drawer, Popover) richtig, und der Moduswechsel ist reines CSS über `data-theme`.
 *
 * Bedeutung trägt immer der TEXT; Punkt und Zeichen sind `aria-hidden`.
 */
export type Statuston = "neutral" | "info" | "ok" | "warnung" | "fehler";

export const STATUSTOENE: readonly Statuston[] = ["neutral", "info", "ok", "warnung", "fehler"];

export function Statuschip({
  ton = "neutral",
  symbol,
  title,
  className,
  children,
}: {
  ton?: Statuston;
  /** Ein Zeichen statt des Punktes (`Icons8Ikone` mit `groesse={12}`). */
  symbol?: ReactNode;
  title?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={[s.chip, s[ton], className].filter(Boolean).join(" ")}
      data-statuschip={ton}
      title={title}
    >
      {symbol ? (
        <span className={s.symbol} aria-hidden="true">{symbol}</span>
      ) : (
        <span className={s.punkt} aria-hidden="true" />
      )}
      {children}
    </span>
  );
}
