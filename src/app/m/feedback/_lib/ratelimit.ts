/**
 * Schlichter Sliding-Window-Limiter, in-memory pro Prozess. Schützt den
 * anonymen Schreib-Pfad (/f/... GET + Submit) gegen Spam/Ballot-Stuffing —
 * Ersatz für den Alt-App-Limiter (router.go:30-93). `now` injizierbar für Tests.
 */
export class RateLimiter {
  private readonly windowMs: number;
  private readonly max: number;
  private readonly now: () => number;
  private readonly hits = new Map<string, number[]>();

  constructor(opts: { windowMs: number; max: number; now?: () => number }) {
    this.windowMs = opts.windowMs;
    this.max = opts.max;
    this.now = opts.now ?? (() => Date.now());
  }

  /** true = erlaubt, false = Limit erreicht. */
  check(key: string): boolean {
    const t = this.now();
    const cutoff = t - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((ts) => ts > cutoff);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(t);
    this.hits.set(key, recent);
    return true;
  }
}
