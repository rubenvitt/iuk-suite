import { isRatingType, type Question, type QuestionType } from "./questions";

export interface DAStats {
  perQuestion: {
    id: string;
    text: string;
    type: QuestionType;
    avg: number | null;
    count: number;
  }[];
  overallAvg: number | null;
  texts: { questionId: string; text: string; values: string[] }[];
  responseCount: number;
}

/** Tolerant wie die Alt-App (aggregation.go:400-411): float64 ODER json.Number-String. */
function toFloat(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

/** FNV-1a (32 Bit). `Math.imul` hält die Multiplikation in Ganzzahl-Arithmetik. */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Deterministische Durchmischung: sortiert nach FNV-1a-Hash des Schlüssels,
 * bei Hash-Kollision nach dem Schlüssel selbst. Gleiche Eingabe → gleiche
 * Ausgabe (testbar), aber vollständig entkoppelt von der Eingangsreihenfolge.
 *
 * Anonymität (Entwurf 3.9): bei rund 15 Personen, die über ihre eigene
 * Gruppenleitung urteilen, ist die Eingangsreihenfolge allein ein
 * Deanonymisierungskanal — wer als Erster ging, stünde oben. Der Tie-Break auf
 * den Schlüssel verhindert, dass eine Kollision still auf die Ankunftsordnung
 * zurückfällt. Die Eingabe wird nicht mutiert.
 */
export function shuffleStable<T>(items: T[], keyOf: (t: T) => string): T[] {
  return items
    .map((item) => {
      const key = keyOf(item);
      return { item, key, h: fnv1a(key) };
    })
    .sort((a, b) => a.h - b.h || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map((x) => x.item);
}

export function computeDAStats(
  questions: Question[],
  rawAnswers: Record<string, unknown>[],
): DAStats {
  // Leseordnung durchmischt (Entwurf 3.9) — dieselbe Ordnung nutzt die
  // CSV-Route. Durchschnitte und Zählungen bleiben davon unberührt.
  const answers = shuffleStable(rawAnswers, (a) => JSON.stringify(a));
  const perQuestion: DAStats["perQuestion"] = [];
  const texts: DAStats["texts"] = [];
  const ratingAvgs: number[] = [];

  for (const q of questions) {
    if (isRatingType(q.type)) {
      const vals = answers
        .map((a) => toFloat(a[q.id]))
        .filter((n): n is number => n !== null);
      const avg = vals.length ? vals.reduce((s, n) => s + n, 0) / vals.length : null;
      perQuestion.push({ id: q.id, text: q.text, type: q.type, avg, count: vals.length });
      if (avg !== null) ratingAvgs.push(avg);
    } else {
      const values = answers
        .map((a) => a[q.id])
        .filter((v): v is string => typeof v === "string" && v.trim() !== "");
      texts.push({ questionId: q.id, text: q.text, values });
      perQuestion.push({
        id: q.id,
        text: q.text,
        type: q.type,
        avg: null,
        count: values.length,
      });
    }
  }

  const overallAvg = ratingAvgs.length
    ? ratingAvgs.reduce((s, n) => s + n, 0) / ratingAvgs.length
    : null;

  return { perQuestion, overallAvg, texts, responseCount: answers.length };
}

export interface TrendPoint {
  periodStart: number; // Unix-Sekunden, Monatsanfang UTC
  label: string; // "YYYY-MM"
  avg: number | null;
  responseCount: number;
}

/**
 * Monatsbuckets über den Zeitraum [from, to] (Unix-Sekunden, inklusiv). Ersetzt
 * den alten lexikografischen YYYY-MM-DD-Präfix-Filter (aggregation.go:178-179),
 * der mit der Zeitstempel-Normalisierung stirbt. Monats-Ø wird nach
 * responseCount gewichtet; leere Monate bekommen avg=null.
 */
export function computeGroupTrend(
  evenings: { date: number; stats: DAStats }[],
  from: number,
  to: number,
): TrendPoint[] {
  const months = enumerateMonths(from, to);
  const buckets = new Map<string, { weighted: number; weight: number; count: number }>();

  for (const e of evenings) {
    if (e.date < from || e.date > to) continue;
    const label = monthLabel(e.date);
    const b = buckets.get(label) ?? { weighted: 0, weight: 0, count: 0 };
    b.count += e.stats.responseCount;
    if (e.stats.overallAvg !== null) {
      b.weighted += e.stats.overallAvg * e.stats.responseCount;
      b.weight += e.stats.responseCount;
    }
    buckets.set(label, b);
  }

  return months.map(({ label, periodStart }) => {
    const b = buckets.get(label);
    return {
      periodStart,
      label,
      avg: b && b.weight > 0 ? b.weighted / b.weight : null,
      responseCount: b?.count ?? 0,
    };
  });
}

function monthStartUTC(sec: number): { year: number; month: number } {
  const d = new Date(sec * 1000);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() }; // month 0-based
}

function monthLabel(sec: number): string {
  const { year, month } = monthStartUTC(sec);
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

function enumerateMonths(from: number, to: number): { label: string; periodStart: number }[] {
  const a = monthStartUTC(from);
  const b = monthStartUTC(to);
  const out: { label: string; periodStart: number }[] = [];
  let y = a.year;
  let m = a.month;
  while (y < b.year || (y === b.year && m <= b.month)) {
    const periodStart = Math.floor(Date.UTC(y, m, 1) / 1000);
    out.push({ label: `${y}-${String(m + 1).padStart(2, "0")}`, periodStart });
    m++;
    if (m > 11) {
      m = 0;
      y++;
    }
  }
  return out;
}

export interface GroupComparison {
  groupId: number;
  groupName: string;
  overallAvg: number | null;
  responseCount: number;
}
