/**
 * DIE SERIENRECHNUNG — rein, ohne Datenbank, ohne Zeitzone.
 *
 * Ein Dienstabend wird im Voraus geplant, und zwar fast immer im Takt: jede
 * Woche, alle zwei Wochen, oder „jeder erste Montag im Monat". Wer das von Hand
 * einträgt, tippt zwölf bis fünfzig Formulare — genau die Arbeit, die eine
 * Jahresplanung unterlässt, wenn sie mühsam ist.
 *
 * WARUM DAS HIER EIN EIGENES MODUL IST und nicht in der Action steht: es ist die
 * einzige Stelle des Vorhabens mit echter Rechnung, und sie ist ohne Rendern und
 * ohne Datenbank prüfbar. Eine Kalenderrechnung, die nur über die Oberfläche
 * erreichbar ist, wird an ihren Rändern (fünfter Dienstag, Jahreswechsel,
 * Sommerzeit) nie geprüft — und genau dort sitzen ihre Fehler.
 *
 * ⚠️ ALLE DATEN HIER SIND MITTERNACHT UTC und meinen einen KALENDERTAG, nicht
 * einen Zeitpunkt. Das ist die Darstellung, die `evenings.date` trägt und die
 * `parseDate` (`actions.ts`) erzeugt. Deshalb ist die Arithmetik reine
 * UTC-Arithmetik: in UTC gibt es keine Sommerzeit, ein „+7 Tage" sind immer
 * 7 × 86 400 000 ms. Würde hier lokal gerechnet, verschöbe der Zeitumstellungs-
 * Sonntag Ende März jeden folgenden Termin um eine Stunde — und nach genügend
 * Sprüngen kippte ein Datum über Mitternacht auf den Vortag.
 * `computeClosesAt` (`lifecycle.ts`) löst den lokalen Kalendertag später selbst
 * über `Europe/Berlin` auf; Mitternacht UTC fällt dort auf 01:00/02:00
 * DESSELBEN Tages, die Zuordnung bleibt also eindeutig.
 */

/**
 * Die Takte, die eine Bereitschaft tatsächlich fährt. `einmalig` ist bewusst
 * einer davon: sonst bräuchte das Formular zwei Wege („einen Abend planen" und
 * „eine Serie planen"), und der einzelne Abend wäre der ungetestete.
 *
 * `monatsWochentag` meint „derselbe Wochentag an derselben Stelle des Monats"
 * (jeder zweite Dienstag), NICHT „derselbe Tag im Monat" (jeder 14.). Der
 * Kalender einer Bereitschaft hängt am Wochentag; ein Dienstabend, der mal auf
 * einen Samstag fällt, ist keiner.
 */
export type Rhythmus = "einmalig" | "woche" | "zweiwochen" | "vierwochen" | "monatsWochentag";

/**
 * Obergrenze für eine Serie. Fünfzig Termine sind knapp ein Jahr im
 * Wochentakt — mehr plant niemand in einem Zug, und die Grenze hält eine
 * Fehleingabe („bis 2099") davon ab, die Datenbank mit 4000 Abenden zu füllen,
 * die anschließend einzeln gelöscht werden müssten.
 */
export const SERIE_MAX_TERMINE = 50;

const TAG_MS = 86_400_000;

/** Wie viele Tage der Takt überspringt. `null` = kein Tagestakt (Monatsregel). */
function tageJeSchritt(rhythmus: Rhythmus): number | null {
  switch (rhythmus) {
    case "woche":
      return 7;
    case "zweiwochen":
      return 14;
    case "vierwochen":
      return 28;
    default:
      return null;
  }
}

/**
 * Der wievielte Wochentag seiner Art ist dieser Tag in seinem Monat? Der 1. bis
 * 7. ist der erste, der 8. bis 14. der zweite, und so weiter.
 */
function stelleImMonat(datum: Date): number {
  return Math.floor((datum.getUTCDate() - 1) / 7) + 1;
}

/**
 * Der `stelle`-te `wochentag` im Monat `jahr`/`monat` (Monat 0-basiert, wie
 * `Date.UTC`), oder `null`, wenn es ihn dort nicht gibt.
 *
 * ⚠️ DER RÜCKFALL AUF DEN LETZTEN WÄRE HIER FALSCH. Ein „fünfter Dienstag" gibt
 * es nur in vier bis fünf Monaten im Jahr; wer in einem Monat ohne ihn
 * stillschweigend den vierten nimmt, verschiebt den Abend um eine Woche und
 * erzeugt in genau diesem Monat einen Termin, den niemand angesetzt hat. Der
 * Monat fällt stattdessen aus — sichtbar, denn die Vorschau zeigt die Liste.
 */
function nterWochentag(
  jahr: number,
  monat: number,
  wochentag: number,
  stelle: number,
): Date | null {
  const erster = new Date(Date.UTC(jahr, monat, 1));
  const abstand = (wochentag - erster.getUTCDay() + 7) % 7;
  const tag = 1 + abstand + (stelle - 1) * 7;
  // Tag 0 des Folgemonats ist der letzte Tag dieses Monats.
  const tageImMonat = new Date(Date.UTC(jahr, monat + 1, 0)).getUTCDate();
  if (tag > tageImMonat) return null;
  return new Date(Date.UTC(jahr, monat, tag));
}

/**
 * Die Termine einer Serie, aufsteigend, `start` eingeschlossen.
 *
 * `bis` ist der letzte Tag, der noch mitzählt (einschließlich). Bei `einmalig`
 * wird es nicht gelesen — der Aufrufer darf es weglassen, ohne dass das Formular
 * eine zweite Gestalt bekommt.
 *
 * Liegt `bis` vor `start`, ist die Serie der Starttermin allein: „bis gestern"
 * ist eine Fehleingabe, und ein leeres Ergebnis wäre ein Formular, das
 * scheinbar nichts tut. Ein einzelner Abend ist das, was die Person sichtbar
 * angesetzt hat.
 */
export function serienTermine(start: Date, bis: Date | null, rhythmus: Rhythmus): Date[] {
  if (rhythmus === "einmalig" || bis === null || bis.getTime() < start.getTime()) {
    return [start];
  }

  const termine: Date[] = [];
  const schritt = tageJeSchritt(rhythmus);

  if (schritt !== null) {
    for (
      let ms = start.getTime();
      ms <= bis.getTime() && termine.length < SERIE_MAX_TERMINE;
      ms += schritt * TAG_MS
    ) {
      termine.push(new Date(ms));
    }
    return termine;
  }

  // Monatsregel: Wochentag und Stelle des Starttermins festhalten und Monat für
  // Monat fortschreiben. Gezählt wird über MONATE, nicht über die gefundenen
  // Termine — sonst bliebe ein ausgefallener fünfter Dienstag unbemerkt an der
  // Obergrenze hängen und die Schleife liefe bis `bis`, statt abzubrechen.
  const wochentag = start.getUTCDay();
  const stelle = stelleImMonat(start);
  let jahr = start.getUTCFullYear();
  let monat = start.getUTCMonth();

  while (termine.length < SERIE_MAX_TERMINE) {
    const termin = nterWochentag(jahr, monat, wochentag, stelle);
    if (termin !== null && termin.getTime() > bis.getTime()) break;
    if (termin !== null && termin.getTime() >= start.getTime()) termine.push(termin);
    monat += 1;
    if (monat > 11) {
      monat = 0;
      jahr += 1;
    }
    // Ein ausgefallener Monat darf die Schleife nicht endlos machen: ohne diese
    // Schranke liefe sie bei einem `bis` weit in der Zukunft zwar in die
    // Obergrenze, bei einem `bis` kurz hinter einem übersprungenen Monat aber
    // nie in den `break` darüber.
    if (Date.UTC(jahr, monat, 1) > bis.getTime()) break;
  }
  return termine;
}

/**
 * Die Takte mit ihrer Beschriftung — EINE Liste, gelesen von der Auswahl im
 * Dialog UND von der Prüfung in der Action. Zwei Listen liefen auseinander, und
 * der Bruch wäre still: ein Takt, den das Formular anbietet und die Action
 * ablehnt, meldet sich als „Dienstabende planen" ohne Wirkung.
 *
 * Dieses Modul trägt bewusst KEIN `"use client"` — sonst käme die Liste in
 * einer Server Component als Client-Referenz an statt als Wert (CLAUDE.md,
 * Falle 6), und die Seite antwortete mit HTTP 500.
 */
export const RHYTHMEN: readonly { wert: Rhythmus; text: string }[] = [
  { wert: "einmalig", text: "Einmalig" },
  { wert: "woche", text: "Jede Woche" },
  { wert: "zweiwochen", text: "Alle zwei Wochen" },
  { wert: "vierwochen", text: "Alle vier Wochen" },
  { wert: "monatsWochentag", text: "Monatlich am gleichen Wochentag" },
];

/** Prüft eine Formulareingabe gegen die Liste, statt sie zu glauben. */
export function istRhythmus(wert: string): wert is Rhythmus {
  return RHYTHMEN.some((r) => r.wert === wert);
}
