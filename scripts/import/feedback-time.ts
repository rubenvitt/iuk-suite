/**
 * Die Alt-DB mischt zwei Formate:
 *  1. Go time.Time.String(): "2006-01-02 15:04:05.999999 -0700 MST m=+…"
 *     — lokale TZ als numerischer Offset + Monotonic-Suffix (muss weg).
 *  2. SQLite CURRENT_TIMESTAMP: "2006-01-02 15:04:05" — UTC, ohne Offset.
 * Beide → Unix-Sekunden (integer-timestamp-Ziel, Sekundenauflösung).
 */
export function normalizeTimestamp(raw: string): number {
  const s = raw.trim();
  // Monotonic-Suffix " m=+…" abschneiden.
  const noMono = s.replace(/\s+m=[+-][\d.]+$/, "");

  // Fall 1: enthält numerischen Offset "+HHMM" oder "-HHMM".
  const m = noMono.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?\s+([+-])(\d{2})(\d{2})\b/,
  );
  if (m) {
    const [, y, mo, d, h, mi, se, sign, oh, om] = m;
    const utcMs = Date.UTC(+y, +mo - 1, +d, +h, +mi, +se);
    const offsetMs = (sign === "+" ? 1 : -1) * (+oh * 60 + +om) * 60_000;
    return Math.floor((utcMs - offsetMs) / 1000);
  }

  // Fall 2: kein Offset → als UTC interpretieren.
  const m2 = noMono.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/);
  if (m2) {
    const [, y, mo, d, h, mi, se] = m2;
    return Math.floor(Date.UTC(+y, +mo - 1, +d, +h, +mi, +se) / 1000);
  }

  throw new Error(`Unbekanntes Zeitstempel-Format: ${raw}`);
}
