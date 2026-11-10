/**
 * Wohin ein Ort auf der Verfall-Seite verlinkt — `null` heisst „kein Blatt,
 * also kein Link".
 *
 * IDA-379: hierher gehoben aus `OrtVerfallTabelle.tsx`, weil seither auch die
 * Chargen-Tabelle darueber ihre Orte ausserhalb des Handlagers verlinkt
 * („liegt ausserdem in: KTW 1 (6)"). Zwei Fassungen derselben Regel liefen
 * auseinander, und der Fehler waere ein toter Link.
 *
 * ⚠️ KEIN "use client": `page.tsx` (Server Component) liest die Funktion
 * ebenso wie die Client-Inseln (Falle 6, `CLAUDE.md`).
 *
 * ⚠️ EIN LAGER LIEGT NICHT UNTER `/verwaltung/fahrzeuge/…`, und der feste Pfad
 * dort war bis DRK-377 richtig, weil `lagerort_verfall` nur an Einheiten
 * haengen konnte. Fuer die Entnahmebox ergaebe er ein 404 — ein toter Link in
 * genau der Zeile, die jemanden zum Aufraeumen schicken soll.
 *
 * ⚠️ UND EIN DRITTES LAGER BEKOMMT KEINEN, statt einen zu raten. Heute schreibt
 * nichts sonst eine Meldung an ein Lager; kaeme eines dazu, waere ein geratenes
 * Ziel schlimmer als gar keines — der Name steht ja da.
 */
import { istEntnahmebox } from "../../../_lib/konstanten";
import { verwaltungDetailPfad } from "../../../_lib/verwaltungPfad";

export function ortHref(zeile: { ortId: string; ortTyp: "lager" | "fahrzeug" }): string | null {
  if (zeile.ortTyp !== "lager") return verwaltungDetailPfad("fahrzeuge", zeile.ortId);
  return istEntnahmebox(zeile.ortId) ? "/verwaltung/entnahmebox" : null;
}
