/**
 * Zeitangaben der Ausleihflaeche als FERTIGE Zeichenketten (Spec 1 §4.1 Punkt 1,
 * `docs/superpowers/specs/2026-08-17-radio-modul-design.md:3338-3342`).
 *
 * ⛔ KEIN `"use client"` — Falle 6 (`CLAUDE.md`, Punkt 6). Die drei Ausleihseiten sind
 * Server Components und brauchen die WERTE, nicht eine Client-Referenz; die Client-Zeilen
 * aus A18 bekommen die fertigen Zeichenketten als Prop. Der Scan, der das modulweit
 * durchsetzt, steht in `src/app/m/radio/riegel.test.ts:977-1030`.
 *
 * ⛔ WARUM SERVERSEITIG, WOERTLICH AUS DER SPEC (`:3341-3342`): „Sonst entscheiden Server
 * und Client an der Tagesgrenze verschieden, und gegen die Zone des Endgeraets
 * systematisch." Der Alt-Kiosk rechnet im Browser
 * (`radio-inventar/apps/frontend/src/components/features/DeviceRow.tsx:23`,
 * `toLocaleTimeString('de-DE')`; `radio-inventar/apps/frontend/src/lib/formatters.ts:32`,
 * `format(date, 'dd.MM.yyyy, HH:mm')`) — diese Datei loest beide Stellen ab.
 *
 * ⛔ DIE ZONE STEHT WOERTLICH HIER UND KOMMT NICHT AUS DER UMGEBUNG. Die
 * Voraussetzungstabelle des Leitplans
 * (`docs/superpowers/plans/2026-08-21-radio-modul-leitplan.md:122`) fuehrt die
 * Umgebungsvariable fuer die Zone ausdruecklich als NICHT gesetzt; ein Rueckfall auf die
 * Systemzone waere auf einer deutschen Entwicklungsmaschine von der richtigen Fassung
 * nicht zu unterscheiden und im Container (UTC) um ein bis zwei Stunden falsch.
 *
 * ⛔ DER FORMATIERER ENTSTEHT JE AUFRUF, NICHT AUF MODULEBENE — und das ist eine Auflage,
 * keine Stilfrage. `_lib/anzeige.test.ts` dreht die Prozesszone waehrend des Laufs auf
 * `America/New_York` und prueft, dass die Ausgabe Berlin bleibt; ein auf Modulebene
 * gebauter `Intl.DateTimeFormat` haette seine Zone aufgeloest, BEVOR jener Fall laeuft,
 * und der Fall waere gruen, ohne etwas zu pruefen. Der Preis ist eine Formatiererinstanz je
 * Zeile einer Liste; die Alternative waere ein Waechter, der nichts bewacht.
 * ⛔ UND SEIT DER FIX-RUNDE 1 ZU A12 STEHT DIESER SATZ NICHT MEHR ALLEIN DA: der Fall „baut
 * beide Formatierer je Aufruf und keinen auf Modulebene" (`src/app/m/radio/_lib/anzeige.test.ts`,
 * zweiter Fall im Block „die Bauform") setzt ihn durch. Bis dahin war die Auflage unbewacht —
 * gemessen: hochgezogen liefen alle sieben Faelle gruen, und hochgezogen PLUS entfernter
 * Zonenzeile blieb sogar der New-York-Fall gruen.
 * ⚠️ JENER WAECHTER ZAEHLT DIE VORKOMMEN DES KONSTRUKTORAUFRUFS IM GANZEN DATEITEXT,
 * Kommentare eingeschlossen: wer ihn hier in Prosa ausschreibt, macht den Fall rot. Deshalb
 * steht in diesem Kopf nirgends der ausgeschriebene Aufruf, sondern nur der Typname.
 *
 * ⚠️ EINGABE IST EIN `Date`, KEINE ZAHL. `loans.borrowed_at` und `loans.returned_at`
 * stehen als `integer(..., { mode: "timestamp" })` im Schema
 * (`src/app/m/radio/_db/schema.ts:218-219`); Drizzle gibt dort ein `Date` heraus — bei
 * `returned_at` ein `Date | null`, denn `:219` traegt KEIN `.notNull()`. Der Parametertyp
 * dieser Datei laesst kein `null` durch; wer eine Rueckgabezeit anzeigt, faltet vorher am
 * Aufrufort. Damit ueberquert an dieser Stelle KEINE Einheitengrenze — die
 * Sekunden/Millisekunden-Regel (`src/app/m/lagerbuch/_db/schema.ts:11-16`) betrifft diese
 * Datei nicht.
 */

/** Die Zone der Flaeche. An genau einer Stelle, damit sie nicht zweimal driften kann. */
const ZONE = "Europe/Berlin";

/**
 * Die reine Uhrzeit, `HH:mm`, zweistellig — z. B. `14:20`.
 *
 * ⛔ OHNE DAS WORT „Uhr". Der Alt-Kiosk haengt es am Aufrufort an
 * (`radio-inventar/apps/frontend/src/components/features/DeviceRow.tsx:23`, woertlich
 * `` ` · ${...} Uhr` ``), und die Spec zitiert die zusammengesetzte Form „Seit 14:20 Uhr"
 * (`:3338`). Wer das Wort hier einbaute, bekaeme an jedem zweiten Aufrufort „Uhr Uhr".
 */
export function uhrzeit(zeit: Date): string {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: ZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(zeit);
}

/**
 * Datum und Uhrzeit, `dd.MM.yyyy, HH:mm` — z. B. `16.07.2026, 01:30`.
 *
 * Die Form ist die des Alt-Kiosk, zeichengleich
 * (`radio-inventar/apps/frontend/src/lib/formatters.ts:32`: `'dd.MM.yyyy, HH:mm'`) —
 * dieselbe Zeichenkette, nur ohne `date-fns` und in der festgenagelten Zone.
 */
export function datumMitUhrzeit(zeit: Date): string {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(zeit);
}
