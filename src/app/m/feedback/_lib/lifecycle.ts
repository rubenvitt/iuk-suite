export type SurveyStatus = "draft" | "active" | "closed" | "archived";

export const DEFAULT_CLOSE_AFTER_HOURS = 48;

/** Einzige Stelle für die Zeitzone der Fristberechnung (Spec-Entscheidung C). */
export const TIME_ZONE = "Europe/Berlin";

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
