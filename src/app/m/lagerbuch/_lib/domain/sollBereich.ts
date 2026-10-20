/**
 * DAS SOLL MIT „OK BIS" — IDA-247. Kein "use client", kein Datenbankzugriff:
 * dieselben drei Funktionen lesen die Check-Insel im Browser, der Abschluss auf
 * dem Server, die Detailseite und die Editoren.
 *
 * Das Soll bleibt die Zahl, auf die nachgefuellt wird. `sollMax` ist die
 * optionale Obergrenze darueber: was bis dorthin an Bord ist, ist in Ordnung.
 * Erst darueber ist es Ueberbestand, und den schlaegt der Check fuer die
 * Entnahmebox vor. Eine Untergrenze unter dem Soll gibt es bewusst nicht —
 * sie aenderte die Nachfuellung, und danach hat niemand gefragt.
 */

/** Ab wann es zu viel ist. Ohne Bereich ist das Soll selbst die Grenze. */
export function obergrenze(soll: number, sollMax: number | null | undefined): number {
  return sollMax != null && sollMax > soll ? sollMax : soll;
}

/** Was ueber der Obergrenze liegt, nie negativ. */
export function ueberschuss(ist: number, soll: number, sollMax: number | null | undefined): number {
  return Math.max(0, ist - obergrenze(soll, sollMax));
}

/**
 * Der Wert, der gespeichert wird: `null`, wenn er keinen Bereich aufspannt.
 *
 * ⚠️ „OK BIS" GLEICH ODER UNTER DEM SOLL WIRD `null` UND NICHT ABGELEHNT. Wer
 * das Soll im Editor hochzieht, ueberholt einen gespeicherten Bereich
 * zwangslaeufig; eine Absage machte jede Soll-Aenderung von einem zweiten Feld
 * abhaengig, das gerade gar nicht zu sehen ist. Ein Bereich ohne Raum ueber
 * dem Soll sagt ohnehin dasselbe wie kein Bereich.
 */
export function sollMaxNorm(soll: number, sollMax: number | null | undefined): number | null {
  return sollMax != null && sollMax > soll ? sollMax : null;
}

/** „4" oder „2–4" — so steht das Soll auf Blatt, Liste und Detailseite. */
export function sollText(soll: number, sollMax: number | null | undefined): string {
  const max = sollMaxNorm(soll, sollMax);
  return max === null ? String(soll) : `${soll}–${max}`;
}
