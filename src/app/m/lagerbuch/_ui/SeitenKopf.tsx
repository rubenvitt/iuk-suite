export { Seitenkopf as SeitenKopf } from "@/core/shell/Seitenkopf";

/*
 * ADAPTER, KEINE ZWEITE FASSUNG. Der Kopf ist am 2026-08-13 nach
 * `core/shell/Seitenkopf.tsx` gezogen, weil `feedback`, `files` und `portal`
 * ihn ebenfalls brauchen. Der Name bleibt hier stehen, damit die 24
 * Aufrufstellen dieses Moduls unverändert bleiben — dasselbe Muster wie bei
 * `_lib/schrift.ts` über `core/theme/schrift.ts`.
 *
 * Die Lagerbuch-Fassung zog ihre Rollen bisher aus `_lib/schrift.ts`, die
 * Suite-Fassung zieht sie aus `core/theme/schrift.ts` — zunächst NICHT
 * derselbe Wert, nachgeprüft statt geglaubt: `_lib/schrift.ts` streicht
 * `fontVariantNumeric` aus `titel` und `neben` (Funktion
 * `ohneZiffernstellung`), `core/theme/schrift.ts` trägt es über `ZIFFERN` auf
 * jeder Rolle, weil dieselbe Rolle auch Tabellenzellen und KPI-Werte bedient.
 * Ein Seitenkopf ist keins von beidem — eine Überschrift vergleicht nichts —
 * und `core/shell/Seitenkopf.tsx` trifft seit dem Befund aus dem Review zu
 * Aufgabe 7 dieselbe Entscheidung wie hier: eine eigene, kleine Kopie von
 * `ohneZiffernstellung` (kein Import aus diesem Modul — Modul-Interna sind
 * kein API von `core` aus) streicht die Eigenschaft dort ebenso aus `titel`
 * und `neben`. Damit ist es jetzt tatsächlich derselbe Wert, nur aus zwei
 * unabhängigen, gleich begründeten Stellen statt aus einer gemeinsamen.
 */
