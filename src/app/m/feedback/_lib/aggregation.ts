import { isRatingType, type Question, type QuestionType } from "./questions";

export interface DAStats {
  perQuestion: {
    id: string;
    text: string;
    type: QuestionType;
    avg: number | null;
    count: number;
  }[];
  /**
   * Mittelwert über ALLE Rating-Fragen — auch über Skalengrenzen hinweg (1–6 und
   * 1–5 gemischt). Bleibt UNVERÄNDERT erhalten, weil der CSV-/Prompt-Pfad ihn
   * seit dem Alt-Import ausgibt. Für jede Ampeldarstellung ist er der falsche
   * Wert: dafür ist `avgSchulnote` da (Entwurf 4.12).
   */
  overallAvg: number | null;
  /**
   * Mittelwert NUR über `schulnote`-Fragen (deutsche Schulnote 1–6, invertiert).
   * `null`, wenn der Bogen keine beantwortete Schulnoten-Frage hat. Jede
   * Ampeldarstellung (Pille, Plakette, Funke, Trendlinie, Vergleich) liest
   * diesen Wert — eine 1–5-Bewertung auf die 6er-Rampe abzutasten legte zwei
   * verschiedene Bedeutungen in dieselbe Farbe (Entwurf 4.12).
   */
  avgSchulnote: number | null;
  /**
   * Der Bogen enthält mindestens eine `stars`-Frage (Alt-Skala 1–5, nur
   * Lesepfad importierter Umfragen). Trägt im Verlauf und im Trend die Fußnote
   * „enthält Altbestands-Fragen (Skala 1–5) — nicht in den Durchschnitt
   * gerechnet". Hängt am FRAGEBOGEN, nicht an den Antworten: eine unbeantwortete
   * `stars`-Frage bleibt eine Altbestands-Frage.
   */
  hasLegacyScale: boolean;
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
  // Zweiter, getrennter Eimer — `ratingAvgs` bleibt Zeichen für Zeichen, was es
  // war (CSV-Kompatibilität, siehe overallAvg).
  const schulnoteAvgs: number[] = [];
  let hasLegacyScale = false;

  for (const q of questions) {
    if (q.type === "stars") hasLegacyScale = true;
    if (isRatingType(q.type)) {
      const vals = answers
        .map((a) => toFloat(a[q.id]))
        .filter((n): n is number => n !== null);
      const avg = vals.length ? vals.reduce((s, n) => s + n, 0) / vals.length : null;
      perQuestion.push({ id: q.id, text: q.text, type: q.type, avg, count: vals.length });
      if (avg !== null) {
        ratingAvgs.push(avg);
        if (q.type === "schulnote") schulnoteAvgs.push(avg);
      }
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
  const avgSchulnote = schulnoteAvgs.length
    ? schulnoteAvgs.reduce((s, n) => s + n, 0) / schulnoteAvgs.length
    : null;

  return {
    perQuestion,
    overallAvg,
    avgSchulnote,
    hasLegacyScale,
    texts,
    responseCount: answers.length,
  };
}

/** Eine Bewertungsfrage samt ihrer Notenverteilung (§3.2 Punkt 2, §2.3). */
export interface FrageVerteilung {
  id: string;
  text: string;
  /**
   * Anzahl je Note, LÄNGE 6, **Index 0 = Note 1**. Genau diese Ordnung erwartet
   * `NotenspurProps.verteilung` (`_ui/Noten.tsx:169`) — der Wert geht ohne
   * Umrechnung dorthin. Eine Umrechnung am Aufrufer wäre eine zweite Stelle, an
   * der sich die Richtung der Skala umdrehen kann, und eine gespiegelte
   * Notenspur behauptet das Gegenteil der Antworten.
   */
  verteilung: number[];
  /** Anzahl der Antworten, die in einer Zelle gelandet sind — das „n=14" der Zeile. */
  count: number;
}

/**
 * DIE VERTEILUNG JE BEWERTUNGSFRAGE (§3.2 Punkt 2 und §2.3 lesen DIESELBE
 * Datenlage: acht Verteilungen, sechs Zellen je Frage).
 *
 * WARUM ES DEN MITTELWERT NICHT ERSETZT, SONDERN ERGÄNZT: 6×Note 1 und 6×Note 5
 * ergeben den Mittelwert 3,0. Ein Balken zeigte dort „befriedigend" — die eine
 * Note, die niemand gegeben hat. Die Verteilung zeigt zwei Säulen und damit die
 * Aussage, die für den Abend zählt: die Gruppe ist gespalten.
 *
 * REIN ADDITIV: `computeDAStats`, `overallAvg` und `avgSchulnote` sind
 * unverändert, der CSV- und Prompt-Pfad liest weiter dieselben Zahlen wie vorher.
 *
 * NUR `schulnote`. `stars` (Alt-Skala 1–5) wird NICHT auf die Sechser-Rampe
 * abgetastet (§4.12): vier von fünf Sternen wären sonst Zelle 4 („ausreichend")
 * — eine gute Bewertung, in der Farbe einer schwachen. Alt-Bögen tragen
 * stattdessen die bestehende Fußnote.
 *
 * Kein `shuffleStable` (anders als `computeDAStats`): eine Verteilung ist von der
 * Eingangsreihenfolge unabhängig, sie kann also keinen Anonymitätskanal öffnen.
 */
export function verteilungJeFrage(
  questions: Question[],
  answers: Record<string, unknown>[],
): FrageVerteilung[] {
  const out: FrageVerteilung[] = [];
  for (const q of questions) {
    if (q.type !== "schulnote") continue;
    const verteilung = [0, 0, 0, 0, 0, 0];
    let count = 0;
    for (const a of answers) {
      const n = toFloat(a[q.id]);
      // EINE Regel für die drei Fälle „unbeantwortet", „nicht lesbar" und
      // „außerhalb 1–6": nur eine ganze Zahl von 1 bis 6 hat eine Zelle. Nichts
      // wird gerundet — eine 2,5 in Zelle 2 oder 3 wäre eine erfundene Antwort.
      if (n === null || !Number.isInteger(n) || n < 1 || n > 6) continue;
      verteilung[n - 1] += 1;
      count += 1;
    }
    out.push({ id: q.id, text: q.text, verteilung, count });
  }
  return out;
}

export interface TrendPoint {
  periodStart: number; // Unix-Sekunden, Monatsanfang UTC
  label: string; // "YYYY-MM"
  /** Der Schulnoten-Ø des Monats (aus `avgSchulnote`), nie der gemischte. */
  avg: number | null;
  responseCount: number;
  /**
   * Mindestens ein Bogen des Monats trägt eine `stars`-Frage. Die Zeile bekommt
   * dafür die Fußnote aus §4.12 — sonst bliebe unerklärt, warum ein Monat mit
   * Rückmeldungen keinen (oder einen aus weniger Fragen gebildeten) Ø hat.
   */
  hasLegacyScale: boolean;
}

/**
 * Monatsbuckets über den Zeitraum [from, to] (Unix-Sekunden, inklusiv). Ersetzt
 * den alten lexikografischen YYYY-MM-DD-Präfix-Filter (aggregation.go:178-179),
 * der mit der Zeitstempel-Normalisierung stirbt. Monats-Ø wird nach
 * responseCount gewichtet; leere Monate bekommen avg=null.
 *
 * GEWICHTET WIRD `avgSchulnote`, NICHT `overallAvg` (§4.12): der gemischte Wert
 * schiebt Alt-Sterne (1–5) auf dieselbe Rampe wie Schulnoten (1–6) — ein Ø von
 * 4,2 aus fünf Sternen erschiene in der Kurve als „ausreichend". Ein Abend ohne
 * beantwortete Schulnotenfrage fällt damit aus der KURVE (kein Gewicht), bleibt
 * aber in `responseCount`: die Rückmeldungen gab es, nur eine Note gab es nicht.
 */
export function computeGroupTrend(
  evenings: { date: number; stats: DAStats }[],
  from: number,
  to: number,
): TrendPoint[] {
  const months = enumerateMonths(from, to);
  const buckets = new Map<
    string,
    { weighted: number; weight: number; count: number; legacy: boolean }
  >();

  for (const e of evenings) {
    if (e.date < from || e.date > to) continue;
    const label = monthLabel(e.date);
    const b = buckets.get(label) ?? { weighted: 0, weight: 0, count: 0, legacy: false };
    b.count += e.stats.responseCount;
    b.legacy = b.legacy || e.stats.hasLegacyScale;
    if (e.stats.avgSchulnote !== null) {
      b.weighted += e.stats.avgSchulnote * e.stats.responseCount;
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
      hasLegacyScale: b?.legacy ?? false,
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
  /**
   * Der Schulnoten-Ø der Gruppe über alle Dienstabende (§4.12). Das Feld hieß
   * `overallAvg` und trug damit den gemischten Wert in die Ampel des
   * Vergleichs — der Name war der Fehler, nicht nur der Wert.
   */
  avgSchulnote: number | null;
  responseCount: number;
  /** Mindestens ein Bogen der Gruppe trägt eine `stars`-Frage (Fußnote §4.12). */
  hasLegacyScale: boolean;
}
