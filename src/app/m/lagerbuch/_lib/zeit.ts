/**
 * Zonenrechnung des Moduls — Entscheidung 26 (b), §4.5.
 *
 * KEIN "use client": die Werte hier werden von Server Components gelesen, und ein
 * WERT aus einem Client-Modul kommt dort nicht an (HTTP 500, Falle 6). Weder
 * `pnpm build` noch Vitest findet das.
 *
 * DIE ZONE STEHT IM CODE, NICHT IN DER PROZESSUMGEBUNG. `TZ=Europe/Berlin` zu
 * setzen ist ein suiteweiter Eingriff gegen vier laufende Module und ausdruecklich
 * nicht Teil dieses Vorhabens (§1.5). Das Modul haengt bewusst nicht daran —
 * `_lib/zeit.test.ts` verstellt `process.env.TZ` absichtlich und beweist es.
 *
 * REGEL FUER DAS GANZE MODUL: ausserhalb dieser Datei steht kein
 * `new Date(jahr, monat, …)` mit mehr als einem Argument und kein
 * getHours/getMinutes/getFullYear/getMonth/getDate auf einem Datum, das dem
 * Nutzer gezeigt oder mit einem Tagesrand verglichen wird.
 */
export const ZEITZONE = "Europe/Berlin";

const TEILE = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZEITZONE,
  hourCycle: "h23",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit",
});

type Zivil = { jahr: number; monat: number; tag: number; std: number; min: number; sek: number };

/** Absoluter Zeitpunkt → Zivilzeit in ZEITZONE. */
function zonenTeile(at: Date): Zivil {
  const p = Object.fromEntries(TEILE.formatToParts(at).map((t) => [t.type, t.value]));
  return {
    jahr: Number(p.year), monat: Number(p.month), tag: Number(p.day),
    // `% 24` ist Guertel und Hosentraeger: manche ICU-Faessungen liefern trotz
    // hourCycle "h23" fuer Mitternacht die 24.
    std: Number(p.hour) % 24, min: Number(p.minute), sek: Number(p.second),
  };
}

/** Offset der Zone zum Zeitpunkt `at`, in Minuten (positiv = oestlich von UTC). */
function zonenOffsetMin(at: Date): number {
  const t = zonenTeile(at);
  const alsUtc = Date.UTC(t.jahr, t.monat - 1, t.tag, t.std, t.min, t.sek);
  const ohneMs = at.getTime() - ((at.getTime() % 1000) + 1000) % 1000;
  return Math.round((alsUtc - ohneMs) / 60000);
}

/**
 * Zivilzeit in ZEITZONE → absoluter Zeitpunkt.
 *
 * ZWEI KANDIDATEN, NICHT EINE ZWEISTUFIGE NAEHERUNG: der Offset haengt vom
 * Ergebnis ab, und an den zwei Umstellungsraendern ist die Zivilzeit entweder
 * doppeldeutig oder gar nicht vorhanden. §4.5 entscheidet beide Faelle benannt:
 *
 *   - Doppeldeutigkeit (letzter Oktobersonntag, 02:30 gibt es zweimal):
 *     die ERSTE Lesart gewinnt, also die Sommerzeit. Deshalb wird der KLEINERE
 *     passende Kandidat genommen.
 *   - Sprungloch (letzter Maerzsonntag, 02:30 gibt es nicht): kein Kandidat
 *     passt; dann gewinnt der GROESSERE, das Ergebnis ist 03:30 Ortszeit.
 *
 * Fuer `monatsEnde` und `startDesTages` ist beides folgenlos — weder 23:59:59.999
 * noch 00:00:00 faellt je in den Berliner Umstellungsrand. Genau deshalb ist die
 * Regel billig und muss trotzdem aufgeschrieben werden.
 */
export function ausZivilzeit(
  jahr: number, monat1bis12: number, tag: number,
  std = 0, min = 0, sek = 0, ms = 0,
): Date {
  const naiv = Date.UTC(jahr, monat1bis12 - 1, tag, std, min, sek, ms);
  const kandidaten = [
    naiv - zonenOffsetMin(new Date(naiv - 86_400_000)) * 60_000,
    naiv - zonenOffsetMin(new Date(naiv + 86_400_000)) * 60_000,
  ].sort((a, b) => a - b);

  for (const k of kandidaten) {
    const t = zonenTeile(new Date(k));
    if (t.jahr === jahr && t.monat === monat1bis12 && t.tag === tag
      && t.std === std && t.min === min && t.sek === sek) {
      return new Date(k);
    }
  }
  return new Date(kandidaten[kandidaten.length - 1]);
}

/**
 * Letzter Tag des Monats "YYYY-MM", 23:59:59.999 Ortszeit.
 *
 * TOLERANT GEGEN DEN DOKUMENTIERTEN DEFEKT: ein Monat ausserhalb 01–12 (etwa
 * "2026-00", der laxe Validator liess ihn frueher durch) faellt auf den
 * Rueckfallzweig von `ausZivilzeit` und ergibt einen Zeitpunkt in der
 * Vergangenheit — die Charge gilt als abgelaufen. Das ist der in §4.6
 * ausgeschriebene, bewusst NICHT behobene Ausgang; der Eingang wird ab jetzt
 * ueber MONAT_REGEX geriegelt (_lib/konstanten.ts).
 */
export function monatsEnde(verfall: string): Date {
  const [j, m] = verfall.split("-").map(Number);
  const letzterTag = new Date(Date.UTC(j, m, 0)).getUTCDate();
  return ausZivilzeit(j, m, letzterTag, 23, 59, 59, 999);
}

/** Mitternacht des Tages, in den `now` in ZEITZONE faellt. */
export function startDesTages(now: Date): Date {
  const t = zonenTeile(now);
  return ausZivilzeit(t.jahr, t.monat, t.tag, 0, 0, 0, 0);
}

/** Inklusive Grenzen eines Tages "YYYY-MM-DD" als absolute Zeitpunkte. */
export function tagesGrenzen(datum: string): { von: Date; bis: Date } {
  const [j, m, t] = datum.split("-").map(Number);
  return {
    von: ausZivilzeit(j, m, t, 0, 0, 0, 0),
    bis: ausZivilzeit(j, m, t, 23, 59, 59, 999),
  };
}

const zz = (n: number) => String(n).padStart(2, "0");

/** "TT.MM. HH:MM" in ZEITZONE — das Journalformat. */
export function fmtTs(d: Date): string {
  const t = zonenTeile(d);
  return `${zz(t.tag)}.${zz(t.monat)}. ${zz(t.std)}:${zz(t.min)}`;
}

/** "YYYY-MM-DD" in ZEITZONE — der Excel-Dateiname. */
export function heuteIso(now: Date = new Date()): string {
  const t = zonenTeile(now);
  return `${t.jahr}-${zz(t.monat)}-${zz(t.tag)}`;
}

/**
 * "HH:MM" in ZEITZONE — die Ablaufzeit der Helfer-Sitzung im Helfer-Rahmen
 * (§3.4.3, §7.8.2). Sie steht hier und nicht in `_lib/format.ts`, weil auch sie
 * Zonenrechnung ist.
 */
export function uhrzeit(d: Date): string {
  const t = zonenTeile(d);
  return `${zz(t.std)}:${zz(t.min)}`;
}
