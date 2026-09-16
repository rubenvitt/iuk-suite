/**
 * DATEINAME UND ZONE DES EXCEL-EXPORTS (DRK-186, „Dateinamen und Zeitzone").
 *
 * KEIN "use client" (Falle 6) — die Funktionen laufen auf BEIDEN Seiten der
 * Grenze, in einem Route Handler wie in einer Client-Insel, und müssen dort
 * dasselbe Ergebnis liefern.
 *
 * ⛔ DIE ZONE STEHT IM CODE, NICHT IN `process.env.TZ` UND NICHT IM BROWSER.
 * Das ist die Frage, die das Ticket dem Baustein vererbt hat, und sie hatte
 * bisher zwei verschiedene Antworten:
 *
 *   heute in `lagerbuch`   `new Date().getFullYear()/getMonth()/getDate()`
 *                          → die Zone des ARBEITSPLATZES
 *   auf dem Server wäre es → die Zone des CONTAINERS (heute UTC)
 *
 * Beide sind falsch, und beide still. Derselbe Bestand, von zwei Rechnern
 * geladen, hieße unterschiedlich; und wandert die Erzeugung je auf den Server,
 * trüge eine um 00:30 Ortszeit geholte Datei den VORTAG im Namen — typkorrekt,
 * lint-sauber, und erst im Ablageordner sichtbar, wo niemand mehr weiß, warum.
 *
 * `Intl.DateTimeFormat` mit fester `timeZone` beantwortet beides auf einmal und
 * rechnet in Node wie im Browser gleich. `en-CA` ist kein Zufall: dieses Gebiet
 * formatiert als `YYYY-MM-DD`, also genau sortierbar — derselbe Griff wie in
 * `lagerbuch/_lib/zeit.ts`.
 *
 * ⚠️ DIE ZONE IST HIER KEINE NEUE SUITE-ENTSCHEIDUNG. Vier Module führen sie
 * heute schon je für sich (`feedback/_lib/lifecycle.ts`, `uav/_lib/datum.ts`,
 * `files/_lib/zeit.ts`, `lagerbuch/_lib/zeit.ts`), und alle vier sagen
 * `Europe/Berlin`. Diese Konstante ist die fünfte Abschrift und ersetzt keine
 * der vier — sie zusammenzuziehen ist ein eigener Posten, kein Nebenertrag
 * dieses Tickets.
 */
export const ZEITZONE_DATEINAME = "Europe/Berlin";

const TAG = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZEITZONE_DATEINAME,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Der Kalendertag in `Europe/Berlin` als `YYYY-MM-DD`. */
export function exportTag(jetzt: Date): string {
  return TAG.format(jetzt);
}

/** Der Medientyp einer `.xlsx` — eine einzige Abschrift für alle Ausgabewege. */
export const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * `bestand` + Zeitpunkt → `bestand-2026-09-16.xlsx`.
 *
 * Der datierte Name ist die Vorgabe für jeden Report, dessen Inhalt sich mit dem
 * Tag ändert: wiederholte Abrufe kollidieren sonst im Ablageordner, und der
 * Browser hängt `(1)`, `(2)` an — woran hinterher niemand mehr ablesen kann,
 * welche Datei die jüngere ist.
 */
export function datierterDateiname(basis: string, jetzt: Date): string {
  return `${basis}-${exportTag(jetzt)}.xlsx`;
}

/**
 * Ein Namensbestandteil aus Nutzerdaten (Gruppenname, Teilnehmername) für den
 * Dateinamen.
 *
 * ⛔ ER GEHT IN EINEN `Content-Disposition`-HEADER. Ein Anführungszeichen oder
 * ein Zeilenumbruch darin zerlegt den Header — dieselbe Lage, die
 * `files/_lib/zip.ts` für Anhänge ausführlich hält. Hier reicht die strengere
 * Antwort, weil ein Report keinen Anzeigenamen zu bewahren hat: alles außer
 * Buchstabe/Ziffer/Bindestrich wird zu `_`, Umlaute eingeschlossen.
 *
 * ⚠️ `\w` REICHT DAFÜR NICHT, obwohl es naheliegt: `\w` ist ASCII-only, also
 * fällt „Müller" auf „M_ller" — was der heutige uav-Weg tut und was hier
 * absichtlich gleich bleibt. Ein `u`-Flag mit `\p{L}` ließe dagegen kyrillische
 * und arabische Buchstaben durch, die im ANGEFÜHRTEN Teil des Headers wieder
 * eine eigene Frage aufmachen.
 */
export function dateinameSlug(roh: string): string {
  return roh.replace(/[^\w-]+/g, "_").replace(/^_+|_+$/g, "") || "export";
}
