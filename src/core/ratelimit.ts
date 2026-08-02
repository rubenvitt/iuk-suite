/**
 * Notbremse gegen Massenzugriffe auf anonyme Schreibpfade — gehoben aus dem
 * Modul `feedback`, weil `files` beide Bausteine ebenfalls braucht (zweiter,
 * heute belegbarer Nutznießer; `docs/design/README.md`).
 *
 * VORBEHALT, der mitgehoben ist und bleiben muss: die Treffer liegen in einer
 * `Map` im PROZESSSPEICHER. Nach einem Neustart sind sie weg, und bei mehreren
 * Instanzen ist der Zähler wirkungslos, weil jede ihren eigenen führt. Für eine
 * Notbremse ist das tragbar. Ein MENGENBUDGET (etwa „so viele Dateien pro
 * Abgabelink") darf deshalb NICHT hier liegen, sondern gehört in die Datenbank.
 */
export class RateLimiter {
  private readonly windowMs: number;
  private readonly max: number;
  private readonly now: () => number;
  private readonly hits = new Map<string, number[]>();

  /** `now` ist injizierbar, damit Tests das Fenster ohne echte Wartezeit überschreiten. */
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

/**
 * Absenderadresse aus den Anfrage-Headern: `cf-connecting-ip`, sonst der ERSTE
 * Wert aus `x-forwarded-for`, sonst `"unknown"`.
 *
 * Die Signatur NIMMT die Header, statt sie selbst zu holen: nur so ist sie aus
 * einem Route Handler benutzbar und ohne Next-Kontext testbar. Aufrufer stellen
 * `await headers()` voran.
 *
 * `Headers` genügt als Parametertyp, obwohl `await headers()` Nexts
 * `ReadonlyHeaders` liefert: das ist zuweisbar (nachgeprüft mit `pnpm typecheck`),
 * ein Cast ist also nicht nötig — und wäre eine Behauptung statt einer Prüfung.
 *
 * WAS DER WERT NICHT IST: ein Beweis. Vor der Suite stehen Cloudflare und
 * Traefik; `cf-connecting-ip` setzt Cloudflare, wer den Container direkt
 * erreicht, kann ihn fälschen. Die Adresse ist Notbremsen-Schlüssel, nie
 * Primärschlüssel — in der Datenbank heißt sie darum `client_ip_unbestaetigt`.
 */
export function clientIpAus(headers: Headers): string {
  const cfIp = headers.get("cf-connecting-ip");
  if (cfIp) return cfIp;
  const forwardedFor = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || "unknown";
}
