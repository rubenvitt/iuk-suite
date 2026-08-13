export { Seitenkopf as SeitenKopf } from "@/core/shell/Seitenkopf";

/*
 * ADAPTER, KEINE ZWEITE FASSUNG. Der Kopf ist am 2026-08-13 nach
 * `core/shell/Seitenkopf.tsx` gezogen, weil `feedback`, `files` und `portal`
 * ihn ebenfalls brauchen. Der Name bleibt hier stehen, damit die 24
 * Aufrufstellen dieses Moduls unverändert bleiben — dasselbe Muster wie bei
 * `_lib/schrift.ts` über `core/theme/schrift.ts`.
 *
 * Die Lagerbuch-Fassung zog ihre Rollen bisher aus `_lib/schrift.ts`, die
 * Suite-Fassung zieht sie aus `core/theme/schrift.ts`. NICHT derselbe Wert,
 * nachgeprüft statt geglaubt: `_lib/schrift.ts` streicht `fontVariantNumeric`
 * aus `titel` und `neben` (Funktion `ohneZiffernstellung`), die Suite-Fassung
 * trägt es über `ZIFFERN` auf jeder Rolle. `<h1>` und Beschreibung tragen
 * seit diesem Umzug `tabular-nums lining-nums`, wo sie es vorher nicht taten
 * — sichtbar nur, wenn Titel oder Beschreibung Ziffern enthalten. Siehe
 * Bericht zu Aufgabe 7 (`task-7-report.md`) für die vollständige Abwägung.
 */
