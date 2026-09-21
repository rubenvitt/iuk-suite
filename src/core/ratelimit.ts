import { createHash } from "node:crypto";
/**
 * Notbremse gegen Massenzugriffe auf anonyme Schreibpfade — gehoben aus dem Modul `feedback`, weil
 * `files` beide Bausteine ebenfalls braucht (zweiter, heute belegbarer Nutznießer; `docs/design/README.md`).
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
  private readonly hits: Schluesselspeicher; // gedeckelt und gefegt: `Schluesselspeicher` unten (DRK-287)

  /** `now` ist injizierbar, damit Tests das Fenster ohne echte Wartezeit überschreiten. */
  constructor(opts: { windowMs: number; max: number; now?: () => number; maxKeys?: number }) {
    this.windowMs = opts.windowMs;
    this.max = opts.max;
    this.now = opts.now ?? (() => Date.now());
    this.hits = new Schluesselspeicher(opts.maxKeys ?? RATELIMIT_MAX_SCHLUESSEL, opts.max, opts.windowMs); }
  /** Ist `key` gerade gesperrt? Fragt nur ab — bucht nichts und legt keinen Eintrag an. */ istGesperrt(key: string): boolean { return this.hits.istGesperrt(key, this.now() - this.windowMs); }
  /** true = erlaubt, false = Limit erreicht (auch: Speicher voll und nur aktive Sperren darin). */
  check(key: string): boolean {
    const t = this.now();
    const cutoff = t - this.windowMs;
    const recent = this.hits.lesen(key, cutoff); if (recent === null) return false;
    if (recent.length >= this.max) {
      this.hits.schreiben(key, recent);
      return false;
    }
    recent.push(t);
    this.hits.schreiben(key, recent);
    return true;
  }
  /** Für Tests und Diagnose. */ get schluesselAnzahl(): number { return this.hits.anzahl; } get schluesselLaengeMax(): number { return this.hits.laengsterSchluessel(); }
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

/**
 * Vorgabe-Obergrenze gleichzeitig geführter Schlüssel je `RateLimiter` (DRK-287). Ein Eintrag
 * kostet höchstens einen Schlüssel von `SCHLUESSEL_MAX_ZEICHEN` Zeichen plus `max` Zeitstempel;
 * bei den heutigen Verwendern (`max` ≤ 60) bleibt ein voller Limiter im niedrigen einstelligen
 * Megabyte-Bereich. Zehntausend gleichzeitig aktive Absender oder Codes in EINEM Fenster liegen
 * weit über jedem echten Betrieb der Suite.
 */
export const RATELIMIT_MAX_SCHLUESSEL = 10_000;

/**
 * Längere Schlüssel werden als SHA-256 geführt, kürzere (Adressen, Codes, Kennungen) im
 * Wortlaut. Das Präfix trennt beide Räume: ein kurzer Schlüssel kann einen gehashten nur
 * treffen, wenn jemand eine Urbild-Suche gegen SHA-256 gewinnt.
 */
const SCHLUESSEL_MAX_ZEICHEN = 64;

function schluesselFuer(key: string): string {
  if (key.length <= SCHLUESSEL_MAX_ZEICHEN) return key;
  return `sha256:${createHash("sha256").update(key).digest("base64url")}`;
}

/** Zeitstempel werden aufsteigend gebucht — gezählt wird von hinten, bis einer abgelaufen ist. */
function zaehleSeit(ts: number[], cutoff: number): number {
  let n = 0;
  for (let i = ts.length - 1; i >= 0 && ts[i] > cutoff; i--) n++;
  return n;
}

/**
 * SPEICHERRAHMEN des `RateLimiter` (DRK-287, CWE-770). Bis dahin blieb jeder je gesehene
 * Schlüssel für immer in der Map; ein anonymer Aufrufer mit immer neuen Schlüsseln ließ den
 * Heap des GANZEN Suite-Prozesses wachsen, auch nach Ablauf jedes Fensters. Jetzt gilt:
 *
 * 1. Einmal je Fenster fegt `lesen` jeden Schlüssel hinaus, dessen letzter Treffer
 *    abgelaufen ist. Ein abgelaufener Schlüssel ist von einem nie gesehenen nicht zu
 *    unterscheiden — es geht keine Information verloren.
 * 2. Die Schlüssellänge hängt nie am Aufrufer (`schluesselFuer`).
 * 3. Ist der Speicher voll, macht ein NEUER Schlüssel nur einem Eintrag Platz, der NICHT
 *    gesperrt ist — dem am längsten ruhenden zuerst. Eine aktive Sperre wird nie verdrängt:
 *    sonst setzte ein Angreifer seine eigene Sperre zurück, indem er mit frischen Schlüsseln
 *    flutet. Verdrängt er stattdessen einen halb vollen Zähler, gewinnt er höchstens `max − 1`
 *    Versuche für diesen einen Schlüssel — um den Preis von `maxKeys` frischen Anfragen.
 * 4. Besteht der Speicher NUR noch aus aktiven Sperren, wird der neue Schlüssel abgewiesen
 *    (fail-closed), bis die erste Sperre fällt. Dahin kommt nur, wer `maxKeys × max`
 *    Treffer in einem Fenster erzeugt; bestehende Schlüssel zählen dabei unverändert weiter.
 *    Die Alternative — dann doch eine Sperre verdrängen — hieße, dass genug Flut jede Sperre
 *    aufhebt; eine Notbremse, die unter Last öffnet, ist keine.
 *
 * ZWEI MAPS STATT EINER, und das ist die Rechenlast, nicht der Speicher: läge alles in einer
 * Map, müsste die Suche nach einem verdrängbaren Eintrag an jeder vorn liegenden Sperre
 * vorbei — bei vollem Speicher O(`maxKeys`) je Anfrage, ein Hebel für Rechenlast. `offen`
 * hält nur Einträge unter `max` (jeder darf weichen, vorn der am längsten ruhende; Treffer
 * laufen nur ab, ein offener Eintrag wird also nie von selbst gesperrt). `gesperrt` hält, was
 * bei der letzten Buchung gesperrt war; erst wenn `offen` leer ist, prüft ein Durchlauf, was
 * davon inzwischen frei ist, und merkt sich, wann die nächste Sperre frühestens fällt.
 */
class Schluesselspeicher {
  private readonly offen = new Map<string, number[]>();
  private readonly gesperrt = new Map<string, number[]>();
  private readonly maxKeys: number;
  private readonly max: number;
  private readonly windowMs: number;
  private letzterKehraus = -Infinity;
  /** Solange `cutoff` darunter liegt, ist kein Eintrag in `gesperrt` frei. */
  private naechsteFreigabe = -Infinity;

  constructor(maxKeys: number, max: number, windowMs: number) {
    this.maxKeys = maxKeys;
    this.max = max;
    this.windowMs = windowMs;
  }

  /** Die noch gültigen Treffer von `key` — oder `null`, wenn für einen neuen Schlüssel kein Platz ist. */
  lesen(key: string, cutoff: number): number[] | null {
    if (cutoff - this.letzterKehraus >= this.windowMs) this.kehraus(cutoff);
    const vorhanden = this.holen(schluesselFuer(key));
    if (vorhanden === undefined && this.anzahl >= this.maxKeys && !this.platzMachen(cutoff)) return null;
    return (vorhanden ?? []).filter((ts) => ts > cutoff);
  }

  /** `recent` enthält nur Treffer im Fenster — seine Länge IST der Zählerstand. */
  schreiben(key: string, recent: number[]): void {
    const k = schluesselFuer(key);
    this.offen.delete(k);
    this.gesperrt.delete(k);
    if (recent.length < this.max) {
      this.offen.set(k, recent);
      return;
    }
    this.gesperrt.set(k, recent);
    this.naechsteFreigabe = Math.min(this.naechsteFreigabe, recent[recent.length - this.max]);
  }

  istGesperrt(key: string, cutoff: number): boolean {
    const recent = this.holen(schluesselFuer(key));
    return recent !== undefined && zaehleSeit(recent, cutoff) >= this.max;
  }

  get anzahl(): number {
    return this.offen.size + this.gesperrt.size;
  }

  laengsterSchluessel(): number {
    let m = 0;
    for (const k of [...this.offen.keys(), ...this.gesperrt.keys()]) m = Math.max(m, k.length);
    return m;
  }

  private holen(k: string): number[] | undefined {
    return this.offen.get(k) ?? this.gesperrt.get(k);
  }

  private kehraus(cutoff: number): void {
    this.letzterKehraus = cutoff;
    for (const map of [this.offen, this.gesperrt]) {
      for (const [k, ts] of map) if (ts.length === 0 || ts[ts.length - 1] <= cutoff) map.delete(k);
    }
  }

  /** Entfernt den am längsten ruhenden ungesperrten Eintrag; false = alles gesperrt. */
  private platzMachen(cutoff: number): boolean {
    if (this.offen.size === 0) {
      if (cutoff < this.naechsteFreigabe) return false;
      let naechste = Infinity;
      for (const [k, ts] of this.gesperrt) {
        if (zaehleSeit(ts, cutoff) < this.max) {
          this.gesperrt.delete(k);
          this.offen.set(k, ts);
        } else {
          naechste = Math.min(naechste, ts[ts.length - this.max]);
        }
      }
      this.naechsteFreigabe = naechste;
      if (this.offen.size === 0) return false;
    }
    const aeltester = this.offen.keys().next().value as string;
    this.offen.delete(aeltester);
    return true;
  }
}
