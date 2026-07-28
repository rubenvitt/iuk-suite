/**
 * DAS ZEITFENSTER DES TRENDS (Entwurf §3.3) — und warum es HIER liegt.
 *
 * Es lag bis 2026-07-27 in `_ui/Segment.tsx`, zusammen mit der Komponente, die
 * es anzeigt. Das war naheliegend und falsch: `Segment.tsx` traegt `"use
 * client"`, und `trend/page.tsx` ist eine Server Component, die den WERT
 * braucht, um `?monate=` zu klemmen. Ueber eine RSC-Grenze kommen aus einem
 * Client-Modul nur Referenzen, keine Werte — `MONATS_FENSTER.includes` war
 * `undefined` und die ganze Seite antwortete mit HTTP 500.
 *
 * `_lib/` traegt kein `use client` und wird von beiden Seiten gelesen. Wer
 * die Konstante zurueck in die Komponente holt, holt den 500er mit; deshalb
 * haelt `trendfenster.test.ts` beide Enden fest.
 */
export const MONATS_FENSTER = [6, 12, 24] as const;

/** Nur 6, 12 oder 24 (§3.3) — alles andere ist 12, ohne Fehlermeldung. */
export function fensterAus(roh: string | undefined): number {
  const n = Number(roh);
  return (MONATS_FENSTER as readonly number[]).includes(n) ? n : 12;
}
