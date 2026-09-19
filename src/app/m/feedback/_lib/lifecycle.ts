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

/** Einzige Stelle für die Zeitzone der Fristberechnung (Spec-Entscheidung C). */
export const TIME_ZONE = "Europe/Berlin";

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
 */
const ISO_TAG = new Intl.DateTimeFormat("sv-SE", { timeZone: TIME_ZONE });

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
  const { year, month, day } = localDateParts(eveningDate, TIME_ZONE);
  const endOfLocalDay = zonedTimeToUtc(year, month, day + 1, 0, 0, 0, TIME_ZONE);
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
