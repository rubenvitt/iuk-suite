/**
 * DIE EINE STELLE, AN DER DAS MODUL `files` EINEN ZEITPUNKT ZONENABHAENGIG IN
 * TEXT VERWANDELT.
 *
 * DIE ABGRENZUNG IST DIE ZONENABHAENGIGKEIT UND NICHT „Anzeige gegen
 * Nicht-Anzeige", denn es gibt eine zweite Stelle: `api/inbox/zip/route.ts` baut
 * den Titel des Sammel-ZIPs aus `new Date().toISOString().slice(0, 10)`, und
 * dieser Text wird sehr wohl GESEHEN — er steht als Ordnername im Download.
 * Er gehoert trotzdem nicht hierher: `toISOString()` liest die Prozesszone
 * strukturell nicht, lokal und im Container kommt dasselbe heraus, und die
 * sortierbare ISO-Form ist fuer einen Dateinamen die richtige Wahl. Er ist damit
 * nicht die Fehlerklasse, die diese Datei schlieszt.
 *
 * Der Preis ist benannt und klein: der Titel nennt den UTC-Kalendertag, nicht
 * den Berliner. Gemessen: `2026-08-01T22:30:00Z` ergibt „Posteingang
 * 2026-08-01", waehrend die Berliner Wanduhr schon den 02.08. zeigt. Das Fenster
 * ist im Sommer 00:00–02:00, im Winter 00:00–01:00 Berliner Zeit. Wer den
 * Berliner Tag will, aendert `route.ts` — nicht diese Datei.
 *
 * `timeZone` IST PFLICHT, NICHT GESCHMACK — dieselbe Begruendungsform wie in
 * `feedback/f/[slugSecret]/page.tsx` und `feedback/_lib/lifecycle.ts`:
 *
 * Ohne `timeZone` formatiert `Intl` in der Zone des SERVERPROZESSES. Weder
 * `compose.yaml` noch das `Dockerfile` setzen `TZ`, der Container laeuft also
 * auf UTC — jede angezeigte Uhrzeit stuende im Sommer zwei Stunden, im Winter
 * eine Stunde vor der Berliner Wanduhr. Auf der Entwicklungsmaschine
 * (`Europe/Berlin`) sind „ohne `timeZone`" und „`timeZone: Europe/Berlin`"
 * dasselbe Ergebnis: **die Anzeige ist lokal richtig und in Produktion
 * falsch.** Genau deshalb faellt es an keinem Tor auf, und genau deshalb laeuft
 * `zeit.test.ts` unter fremden Prozess-Zeitzonen.
 *
 * WARUM DURCHWEG `Europe/Berlin` UND NIRGENDS `"UTC"`. Das Modul `feedback`
 * benutzt beides, und die Unterscheidung ist die Frage nach dem gespeicherten
 * WERT: ein KALENDERTAG, der als Mitternacht UTC abgelegt ist, muss in UTC
 * formatiert werden (sonst rutscht der Tag), ein echter ZEITPUNKT in der Zone,
 * in der man ihn abliest. Alle Spalten, die hier hindurchlaufen — `expires_at`,
 * `created_at`, `empfangen_at`, `downloaded_at` — sind `mode: "timestamp"` und
 * damit echte Zeitpunkte (`_db/schema.ts`); es gibt im Modul `files` keine
 * Kalendertagsspalte. Deshalb ist `UTC` hier ueberall die falsche Antwort.
 *
 * DIE ZONE KOMMT AUS `core/zeit` (DRK-469). Die Portal-Verwaltung stellt sie
 * suiteweit ein, der Standard ist `Europe/Berlin`. Frueher stand hier eine
 * eigene Konstante neben `TIME_ZONE` in `feedback` — zwei Wahrheiten, die nur
 * zufaellig gleich lauteten.
 *
 * KEIN `"use client"`, und das ist tragend (Falle 6): die Aufrufer sind
 * ueberwiegend Server Components. Aus einem `"use client"`-Modul bekaemen sie
 * eine Client-Referenz statt der Funktion — HTTP 500 fuer die ganze Seite, das
 * weder `pnpm build` noch `pnpm typecheck` noch Vitest findet. Wer diesen
 * Baustein braucht, importiert von HIER; umgekehrt nie.
 *
 * DIE ZONE STEHT IM NAMEN, nicht in einem Kommentar — Modulregel §9.1, dieselbe
 * wie bei `MILLISEKUNDEN_PRO_STUNDE` oder `BYTE_EINHEITEN_BINAER`: `…InZone`
 * sagt am Aufrufort, dass das Ergebnis in der Suite-Zone gilt und nicht in der
 * des Prozesses oder des Geraets.
 *
 * DREI FUNKTIONEN UND NICHT EINE. Die drei Formen sind im Modul in Gebrauch und
 * unterscheiden sich in der AUSSAGE, nicht im Geschmack; sie zu einer
 * zusammenzuziehen aenderte angezeigten Text. Eine vierte Form kommt hierher,
 * nicht an ihren Aufrufort.
 */

/*
 * `zeitzone()` ist die Zone, in der dieses Modul Zeitpunkte ANZEIGT. Nicht die
 * Zone, in der gerechnet wird — gerechnet wird ueberall in echten Zeitpunkten
 * (`Date.getTime()`), und das ist zonenfrei.
 */
import { zeitFormat } from "@/core/zeit";

/*
 * Die Formatierer stehen auf Modulebene und nicht im Rumpf: ein
 * `Intl.DateTimeFormat` je Tabellenzeile ist der teuerste Teil einer solchen
 * Projektion. Dass sie hinter Funktionen liegen und nicht selbst exportiert
 * sind, hat einen zweiten Grund: ein exportierter Formatierer laedt dazu ein,
 * ihn mit anderen Optionen weiterzureichen, und dann steht die Zonenzusage
 * wieder an mehreren Orten.
 */
const KURZ = zeitFormat("de-DE", {
  dateStyle: "medium",
  timeStyle: "short",
});

const GENAU = zeitFormat("de-DE", {
  dateStyle: "medium",
  timeStyle: "medium",
});

const LANG = zeitFormat("de-DE", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** „31.07.2026, 14:00" — die Arbeitsform der Verwaltungsansichten. */
export function zeitpunktInZone(zeitpunkt: Date): string {
  return KURZ.format(zeitpunkt);
}

/**
 * „31.07.2026, 14:00:03" — mit SEKUNDE. Das Zugriffsprotokoll fuehrt sie mit:
 * zwei Downloads derselben Minute waeren sonst nicht auseinanderzuhalten, und
 * genau die Reihenfolge ist die Frage, die man an ein Protokoll stellt.
 */
export function zeitpunktGenauInZone(zeitpunkt: Date): string {
  return GENAU.format(zeitpunkt);
}

/**
 * „31. Juli 2026 um 14:00" — die ausgeschriebene Form der oeffentlichen
 * Empfaengerseite. Dort ist der Ablauf die einzige Zahl, nach der sich jemand
 * richtet, und sie steht auf einem fremden Handy ohne weiteren Zusammenhang;
 * ein `07` im Kalenderformat waere dort die zweideutigere Angabe.
 */
export function langerZeitpunktInZone(zeitpunkt: Date): string {
  return LANG.format(zeitpunkt);
}
