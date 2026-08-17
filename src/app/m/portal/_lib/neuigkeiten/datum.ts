import { ISO_DATUM } from "@/app/m/portal/_lib/neuigkeiten/typen";

/**
 * `2026-08-16` → `16. August 2026`.
 *
 * ZEITZONE `UTC`, UND DAS IST DER GANZE TRICK. Ein `new Date("2026-08-16")`
 * ist nach ECMA-262 Mitternacht UTC; formatiert in `Europe/Berlin` bliebe der
 * Tag im Sommer richtig und im Winter ebenfalls — aber jede Zeitzone WESTLICH
 * von UTC (und dort läuft ein CI-Runner schneller, als man denkt) zeigte den
 * Vortag. Ein Datum ohne Uhrzeit hat keine Zeitzone; es hier in eine zu
 * überführen wäre eine Aussage, die die Notiz nie gemacht hat. Deshalb wird das
 * ISO-Tripel per `Date.UTC` gesetzt und in `UTC` gelesen — rein und ortsfest.
 *
 * Andere Module formatieren ihre Zeitpunkte über `Europe/Berlin`
 * (`files/_lib/zeit.ts`, `feedback/_ui/datum.ts`), und das bleibt dort richtig:
 * die tragen echte Zeitstempel mit Uhrzeit. Diese Datei ist die Ausnahme mit
 * Grund, nicht eine vierte Fassung derselben Sache.
 *
 * BEI UNGÜLTIGER EINGABE KOMMT DIE ZEICHENKETTE ZURÜCK, statt dass es wirft.
 * `register.test.ts` lässt ein krummes Datum gar nicht erst ins Repo; sollte
 * doch eines durchkommen, ist eine Zeile mit `2026-8-1` in der Metazeile
 * unschön — ein Wurf von hier wäre HTTP 500 für die ganze Seite, wegen einer
 * Beschriftung.
 */
const TAG_LANG = new Intl.DateTimeFormat("de-DE", {
  timeZone: "UTC",
  day: "numeric",
  month: "long",
  year: "numeric",
});

export function formatiereDatum(iso: string): string {
  if (!ISO_DATUM.test(iso)) return iso;
  const [jahr, monat, tag] = iso.split("-").map(Number);
  const zeitpunkt = new Date(Date.UTC(jahr, monat - 1, tag));
  // `Date.UTC(2026, 12, 1)` rollt still in den Januar 2027 — ein Datum wie
  // `2026-13-01` besteht die Regex und wäre danach ein anderer Tag, als da
  // steht. Also zurück in die ISO-Form und vergleichen, statt zu vertrauen.
  if (zeitpunkt.toISOString().slice(0, 10) !== iso) return iso;
  return TAG_LANG.format(zeitpunkt);
}
