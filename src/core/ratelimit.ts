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
 * Absenderadresse aus den Anfrage-Headern: `cf-connecting-ip`, sonst der
 * konstante Sammelwert `"unknown"`.
 *
 * CWE-348-UMSTELLUNG (2026-08-21, Vorarbeit vor Planteil 3 des Moduls
 * `radio`, `.superpowers/sdd/VORARBEIT-ratelimit.md`): `x-forwarded-for` wird
 * seit dieser Änderung in KEINER Richtung mehr gelesen. Zuvor nahm die
 * Funktion ohne `cf-connecting-ip` den ERSTEN `x-forwarded-for`-Eintrag — den
 * vom Client selbst behaupteten Wert. Der Suite-Container ist auf dem Server
 * direkt erreichbar, an Cloudflare und Traefik vorbei (Betreiber, 03.08.2026,
 * `src/app/m/lagerbuch/_lib/absender.ts:6-7`); wer ihn so erreicht, setzt
 * `x-forwarded-for` vollständig selbst und bekam pro Versuch einen frischen
 * Ratenbegrenzungs-Schlüssel — CWE-348 („Use of Less Trusted Source").
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
 * erreicht, kann ihn fälschen. Ob dieser Direktzugriff am Rand geschlossen
 * ist, bleibt eine offene, benannte Betriebsentscheidung (D6, 04.08.2026,
 * `docs/superpowers/specs/2026-08-03-lagerbuch-modul-design.md` §3.5.2) —
 * diese Änderung schließt sie nicht. Die Adresse ist Notbremsen-Schlüssel,
 * nie Primärschlüssel — in der Datenbank heißt sie darum
 * `client_ip_unbestaetigt`.
 *
 * KEIN `cf:`-Präfix (anders als lagerbuchs `absenderAus`,
 * `src/app/m/lagerbuch/_lib/absender.ts:48-51`): der Rückgabewert läuft für
 * die Speicherklasse der Aufrufstellen (`ipKuerzen`,
 * `src/app/m/files/_lib/ip.ts:26-48`) unverändert durch — ein Präfix machte
 * dort jede echte Adresse zu `null`. Konsequenz: ein gefälschtes
 * `cf-connecting-ip: unknown` teilt sich den Sammel-Eimer mit kopflosen
 * Aufrufern — eine akzeptierte Bündelung, keine neue Fälschbarkeit (sie
 * eröffnet keinen frischen Schlüssel je Versuch, anders als CWE-348).
 *
 * NACHTRAG, GEMESSEN (Ruben, 2026-08-22, `test.iuk-ue.de`, Cloudflare +
 * Traefik + `whoami`; voller Befund:
 * `docs/superpowers/berichte/2026-08-22-client-ip-hinter-cloudflare.md`):
 *
 * — `cf-connecting-ip` ist über den Cloudflare-Weg NICHT fälschbar: schickt
 *   der Client den Kopf selbst, antwortet Cloudflare am Edge mit 403, die
 *   Anfrage erreicht den Origin nie. Das widerlegt den ursprünglichen
 *   Verdacht dieses Postens, ein Angreifer könne den Kopf über Cloudflare
 *   frei rotieren — MIT Vorbehalt: das gilt nur, solange der Direktzugriff
 *   an Cloudflare vorbei (D6, siehe oben) tatsächlich geschlossen ist. Diese
 *   Messung prüft nur den Cloudflare-Weg, nicht D6.
 * — `X-Forwarded-For` bleibt fälschbar (Cloudflare stellt einen
 *   client-gesetzten Wert nur VORAN, verwirft ihn nicht) — das ist das
 *   tatsächliche CWE-348-Loch, das dieser Posten schließen sollte.
 * — ⛔ `True-Client-IP` wird von Cloudflare UNGEFILTERT durchgereicht,
 *   gemessen (`5.5.5.5` kam unverändert an). Dieser Kopf darf NIE als Quelle
 *   für diese Funktion dienen — er ist die naheliegendste falsche Abhilfe,
 *   sobald `cf-connecting-ip` einmal als „unzuverlässig" gilt.
 * — ⛔ AUF MODUL-HOSTS (jedes Modul mit eigenem `SUITE_HOST_<KEY>` außer
 *   `portal` — `qr`, `feedback`, `files`, `lagerbuch`, `aufgaben`,
 *   `src/core/registry.ts:57-186`) ist `cf-connecting-ip` bei jeder Anfrage
 *   die EGRESS-ADRESSE DIESES SERVERS, nicht die des Clients: der
 *   Modul-Host-Rewrite (`src/proxy.ts`) erzeugt einen zweiten, externen
 *   Round-Trip über Cloudflare zurück auf den Apex. **Diese Änderung ist für
 *   diese Hosts KEIN Rate-Limit-Fix** — der Sammel-Eimer aus K2/W2 des
 *   Reviews bestand schon vor `7d71b6c`, weil der alte Code
 *   `cf-connecting-ip` dort ebenfalls Vorrang gab. Die Commit-Botschaft von
 *   `7d71b6c` („CWE-348 aus clientIpAus entfernen") gilt darum nur für den
 *   Apex — nicht generell, und ⛔ Planteil 3 des Moduls `radio` darf sich
 *   NICHT darauf verlassen, solange `radio` selbst auf einem Modul-Host läuft
 *   (`.superpowers/sdd/KONTEXT-radio-planteil2.md`, Nachtrag). Abhilfe
 *   geplant, nicht gebaut: `.superpowers/sdd/VORARBEIT-selfhop.md`.
 */
export function clientIpAus(headers: Headers): string {
  const cfIp = headers.get("cf-connecting-ip");
  return cfIp || "unknown";
}
