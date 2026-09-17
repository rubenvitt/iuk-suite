/**
 * EIN SUCHPARAMETER, DER GENAU EINEN WERT MEINT — DRK-373 (Codex-Befund P2 zu
 * PR #186).
 *
 * Kein "use client", kein Icon-Import (Fallen 6 und 7): Server Components
 * lesen diese Funktion.
 *
 * ⚠️ NEXTS `searchParams` IST `string | string[] | undefined`, UND ZWAR
 * UNABHAENGIG DAVON, WAS DIE SEITE ALS TYP HINSCHREIBT
 * (`next/dist/server/request/search-params`). Bei `?fz=a&fz=b` kommt ein Array
 * an. Eine engere Signatur an der Seite aendert den LAUFZEITWERT nicht —
 * `typecheck` und `build` bleiben gruen, und nur ein echter Abruf mit doppeltem
 * Parameter zeigt es. Genau das ist hier passiert: `gescannt?: string` war eine
 * Behauptung, und bei `?gescannt=b&gescannt=b` verglich die Check-Seite ein
 * Array mit einer Id, traf nie, und der Hinweis „dein Scan gilt hier nicht"
 * verschwand STILL — also derselbe Ausgang, gegen den DRK-373 geschrieben ist.
 *
 * ⚠️ DIESELBE BEDEUTUNG WIE `zaehlOrtAus` (`_lib/inventurOrt.ts`, DRK-337), und
 * das ist Absicht statt Zufall: DERSELBE Wert mehrfach ist eine Wahl und wird
 * genommen; ZWEI VERSCHIEDENE sind ein Widerspruch und ergeben `undefined`.
 * Den ersten zu nehmen hiesse, sich still fuer eine von zwei Anweisungen zu
 * entscheiden — und auf dem Schirm stuende nichts, was sagt, welche.
 *
 * ⚠️ WARUM TROTZDEM EINE EIGENE FUNKTION UND KEIN AUFRUF VON `zaehlOrtAus`:
 * jene filtert `ZAEHLORT_ALLE` heraus und trimmt — beides gilt nur fuer den
 * Zaehlort der Inventur. Hier waere das erste eine fachliche Regel aus einem
 * fremden Zusammenhang, und ein Ort namens „alle" fiele still weg.
 *
 * ⚠️ EIN LEERER WERT IST KEIN WERT. `?fz=` ergibt die leere Zeichenkette;
 * als Id waere sie nie zu finden, und `fahrzeuge.find` liefe darauf hinaus,
 * „nichts gewaehlt" als „Id nicht gefunden" zu behandeln. Dieselbe Antwort ist
 * ehrlicher: es steht kein Wert da.
 */
export function einWert(roh: string | string[] | undefined): string | undefined {
  const werte = [...new Set(
    (Array.isArray(roh) ? roh : [roh]).filter((wert): wert is string => Boolean(wert)),
  )];
  return werte.length === 1 ? werte[0] : undefined;
}
