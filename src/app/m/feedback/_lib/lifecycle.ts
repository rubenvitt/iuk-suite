export type SurveyStatus = "draft" | "active" | "closed" | "archived";

/**
 * Die Lebenslage eines DIENSTABENDS — nicht die seiner Umfrage. Die Begründung,
 * warum das zwei getrennte Achsen sind, steht im Kopf von `_db/schema.ts` bei
 * `evenings`; kurz: der Abend ist die erste Klasse, die Erhebung hängt daran.
 *
 * ⚠️ HIER GIBT ES KEIN GEGENSTÜCK ZU `nextStatusOnAccess`, und das ist Absicht.
 * Eine Umfrage faltet beim Zugriff von `active` auf `closed`, weil ihre Frist
 * verstrichen ist — ein geplanter Abend, dessen Datum vorbei ist, faltet auf
 * NICHTS. Ob an jenem Abend Dienst war, weiß der Kalender nicht, nur ein
 * Mensch: freigegeben, abgesagt, oder schlicht vergessen. Ein automatisches
 * „ist wohl gelaufen" trüge eine Behauptung in die Historie, und ein
 * automatisches „war wohl abgesagt" löschte einen Abend, den es gab.
 * Ein vergangener geplanter Abend bleibt deshalb sichtbar stehen und wartet auf
 * eine Entscheidung.
 */
export type EveningStatus = "planned" | "held" | "cancelled";

export const DEFAULT_CLOSE_AFTER_HOURS = 48;

/** Die Zone der Fristberechnung (Spec-Entscheidung C) ist die der Suite: `zeitzone()`. */
import { zeitFormat, zeitzone } from "@/core/zeit";

/**
 * DER KALENDERTAG EINES ZEITPUNKTS als `YYYY-MM-DD` in `Europe/Berlin` — die
 * EINE Stelle, an der diese Umrechnung steht.
 *
 * ⚠️ WARUM NICHT `toISOString().slice(0, 10)`: `evenings.date` SOLL Mitternacht
 * UTC tragen, aber der Import erzwingt das nicht (`scripts/import/feedback.ts`,
 * `toNewEvening` reicht den Alt-Zeitstempel durch). Ein Abend, der als
 * `2026-04-16 00:30 +0200` importiert wurde, steht als `2026-04-15T22:30Z` in
 * der Datenbank: in UTC ist das der 15., in Berlin — und damit überall, wo die
 * Suite ihn anzeigt — der 16. Wer hier UTC nähme, entdoppelte gegen einen Tag,
 * den niemand sieht.
 *
 * Hier und nicht in `_ui/datum.ts`, obwohl dort dieselbe Formatierung steht:
 * `_db/queries.ts` braucht sie auch, und ein Import aus `_ui` in die
 * Datenbankschicht kehrte die Richtung um. `datum.ts` greift deshalb hierher
 * durch — zwei Formatierer wären zwei Wahrheiten über denselben Tag.
 *
 * `sv-SE` ist das einzige gängige Gebietsschema, dessen Kurzformat `YYYY-MM-DD`
 * ist — also genau das, was `<input type="date">` als `value` verlangt.
 *
 * ⚠️ DIESES MODUL DARF DESHALB NIE `"use client"` TRAGEN. Es wird von
 * `_db/queries.ts` in einer Server Component gelesen; als Client-Modul markiert,
 * käme eine Client-Referenz statt des Wertes an (CLAUDE.md, Falle 6) — HTTP 500
 * für die ganze Seite, und weder `build` noch Vitest sehen es.
 */
const ISO_TAG = zeitFormat("sv-SE", {});

export function kalendertagInZone(datum: Date): string {
  return ISO_TAG.format(datum);
}

/** Y/M/D von `date`, wie sie in `timeZone` lokal gesehen werden. */
function localDateParts(
  date: Date,
  timeZone: string,
): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

/** UTC-Offset (in Minuten, lokal minus UTC) von `timeZone` zum Zeitpunkt `instant`. */
function offsetMinutesAt(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtcMs = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return (asUtcMs - instant.getTime()) / 60_000;
}

/**
 * Wandelt eine lokale Wanduhrzeit (Y-M-D h:m:s) in `timeZone` in den entsprechenden
 * UTC-Zeitpunkt um. Zwei Iterationen genügen: Europe/Berlin springt maximal 1h, und
 * 00:00 Uhr lokal fällt nie in eine übersprungene oder doppelte Stunde (die
 * DST-Umstellung liegt in Berlin immer bei 2:00/3:00 nachts).
 */
function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): Date {
  const naiveUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  let instantMs = naiveUtcMs;
  for (let i = 0; i < 2; i++) {
    const offset = offsetMinutesAt(new Date(instantMs), timeZone);
    instantMs = naiveUtcMs - offset * 60_000;
  }
  return new Date(instantMs);
}

/**
 * Ende des lokalen Kalendertags (Europe/Berlin) von `eveningDate` + `closeAfterHours`
 * (Spec-Entscheidung C). `eveningDate` ist der Abend-Tag der Umfrage — nicht mehr die
 * Aktivierungszeit. `evenings.date` liegt als Mitternacht UTC vor; der lokale
 * Kalendertag wird hier explizit über `timeZone` aufgelöst, nicht über die
 * UTC-Repräsentation.
 */
export function computeClosesAt(eveningDate: Date, closeAfterHours: number): Date {
  const { year, month, day } = localDateParts(eveningDate, zeitzone());
  const endOfLocalDay = zonedTimeToUtc(year, month, day + 1, 0, 0, 0, zeitzone());
  return new Date(endOfLocalDay.getTime() + closeAfterHours * 3600_000);
}

export function isExpired(closesAt: Date | null, now: Date): boolean {
  if (closesAt === null) return false;
  return now.getTime() >= closesAt.getTime();
}

/**
 * Lazy Auto-Close (Spec Entscheidung 3): eine aktive, abgelaufene Umfrage gilt
 * beim nächsten Zugriff als geschlossen. Alle anderen Zustände bleiben. Rein —
 * das Persistieren übernimmt der Aufrufer (Repo/Action), auf GET UND Submit.
 */
export function nextStatusOnAccess(
  status: SurveyStatus,
  closesAt: Date | null,
  now: Date,
): SurveyStatus {
  if (status === "active" && isExpired(closesAt, now)) return "closed";
  return status;
}

/**
 * DARF DIESER GEPLANTE ABEND JETZT FREIGEGEBEN WERDEN? — eine reine Funktion,
 * weil dieselbe Frage an ZWEI Stellen beantwortet werden muss: die Action
 * entscheidet sie verbindlich, die Oberfläche entscheidet sie, um den Knopf
 * gar nicht erst anzubieten. Zwei Fassungen liefen auseinander, und der
 * sichtbare Teil wäre der falsche gewesen.
 *
 * Drei Ausgänge, und die beiden Riegel haben verschiedene Gründe:
 *
 * `zuFrueh` — vor dem Kalendertag des Dienstes. Die Freigabe setzt den Abend
 * auf `held`, und das heißt überall „hat stattgefunden": ein Klick auf die
 * falsche Zeile der Jahresplanung machte den Dezembertermin im September zum
 * gelaufenen und schlösse dabei die tatsächlich laufende Umfrage.
 *
 * `abgelaufen` — die Frist des Abends ist schon vorbei. `computeClosesAt`
 * ankert am ABENDDATUM, nicht am Klick; ein vergessener Termin von letzter
 * Woche bekäme also eine Frist in der VERGANGENHEIT, und der erste öffentliche
 * Aufruf faltete den Bogen sofort auf `closed` (`nextStatusOnAccess`).
 * Herausgekommen wäre: die laufende Umfrage beendet, ein toter Bogen an ihrer
 * Stelle, und eine Bestätigung, die „ab sofort kann geantwortet werden"
 * versprochen hat. Lieber gar nicht freigeben — absagen, löschen oder das Datum
 * korrigieren bleiben offen.
 *
 * ⚠️ „Abgelaufen" ist NICHT dasselbe wie „Tag vorbei", und der Unterschied ist
 * der Alltagsfall: wer den Bogen am Morgen nach dem Dienstabend freigibt, ist
 * spät dran, aber innerhalb der Frist (gemessen bei 48 Stunden: bis zwei Tage
 * Rückstand offen, ab drei tot). Genau dafür gibt es die beiden getrennten
 * Ausgänge statt eines einzigen Datumsvergleichs.
 */
export type Freigabelage = "ok" | "zuFrueh" | "abgelaufen";

export function freigabelage(
  eveningDate: Date,
  closeAfterHours: number,
  now: Date,
): Freigabelage {
  if (kalendertagInZone(eveningDate) > kalendertagInZone(now)) return "zuFrueh";
  if (isExpired(computeClosesAt(eveningDate, closeAfterHours), now)) return "abgelaufen";
  return "ok";
}
