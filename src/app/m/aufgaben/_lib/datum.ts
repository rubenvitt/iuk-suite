/*
 * ZEIT UND KALENDER — die eine Stelle. KEIN "use client".
 *
 * DIE ZONE STEHT GENAU HIER. In UTC gerechnet liefert `isoTag` zwischen 00:00
 * und 02:00 deutscher Sommerzeit den VORTAG, und davon haengen die
 * Ueberfaelligkeitsrechnung und die „heute"-Markierung im Wochenplan ab.
 *
 * DIE TAGESARITHMETIK RECHNET DAGEGEN IN UTC UM 12:00 — bewusst.
 * `montagDerWoche` und `wochenTage` verschieben KALENDERTAGE, und ein
 * Tageswechsel um Mittag kreuzt keine Sommerzeitgrenze. In Ortszeit muesste jede
 * Verschiebung die Umstellungsnacht behandeln, in der ein Tag 23 oder 25 Stunden
 * hat.
 */

export const ZONE = "Europe/Berlin";

/** `en-CA` ist das Gebietsschema mit dem Format `YYYY-MM-DD` — kein eigener Zusammenbau. */
const ISO_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Der Kalendertag, an dem dieser Zeitpunkt in Deutschland liegt. */
export function isoTag(zeitpunkt: Date): string {
  return ISO_FORMAT.format(zeitpunkt);
}

/** 12:00 UTC des genannten Tages — der sommerzeitfeste Anker fuer Tagesarithmetik. */
function anker(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

function ausAnker(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * 0 = Montag … 4 = Freitag; Samstag und Sonntag ergeben `null` — das Modul kennt
 * eine Fuenftagewoche, und eine 5 waere ein Index neben das Wochengitter.
 */
export function wochentagVon(iso: string): number | null {
  const tag = anker(iso).getUTCDay();
  return tag >= 1 && tag <= 5 ? tag - 1 : null;
}

/**
 * Der Montag der Woche, in der dieser Tag liegt.
 *
 * `getUTCDay()` gibt am Sonntag 0. Ein naives `tag - wochentag + 1` landet dann
 * auf dem Montag der FOLGENDEN Woche — fachlich gehoert der Sonntag zur Woche,
 * die am Montag davor begann.
 */
export function montagDerWoche(iso: string): string {
  const d = anker(iso);
  const wochentag = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (wochentag === 0 ? -6 : 1 - wochentag));
  return ausAnker(d);
}

/** Montag bis Freitag der Woche, die mit `montagIso` beginnt. */
export function wochenTage(montagIso: string): string[] {
  return Array.from({ length: 5 }, (_, i) => {
    const d = anker(montagIso);
    d.setUTCDate(d.getUTCDate() + i);
    return ausAnker(d);
  });
}

/**
 * `iso`, um `n` Kalendertage verschoben (negativ = rueckwaerts) — ueber denselben
 * sommerzeitfesten Anker wie `wochenTage`. DIE EINE STELLE fuer Tagesarithmetik
 * im Modul: `new Date(Date.now() + n * TAG_MS)` rechnet auf dem rohen Instant und
 * verlegt danach nur die Zone, nicht die Arithmetik — an einer Umstellungsnacht
 * verschiebt sich das Ergebnis um eine Stunde und damit moeglicherweise um einen
 * Kalendertag.
 */
export function tagePlus(iso: string, n: number): string {
  const d = anker(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return ausAnker(d);
}

const WOCHENTAGE_KURZ = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"] as const;

/**
 * „Do, 13.08." — nie ISO. Der Wochentag ist bei einer Wochenplanung die
 * eigentliche Information.
 *
 * Eigene Tabelle statt `Intl`: dessen Kurzform traegt einen Punkt („Do.") und
 * die Abkuerzungen sind zwischen ICU-Fassungen nicht stabil — auf einem
 * Linux-Runner also moeglicherweise andere als auf der Entwicklermaschine.
 */
export function fmtTagKurz(iso: string): string {
  const d = anker(iso);
  const tag = String(d.getUTCDate()).padStart(2, "0");
  const monat = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${WOCHENTAGE_KURZ[d.getUTCDay()]}, ${tag}.${monat}.`;
}

export function minutenVon(uhrzeit: string): number {
  const [h, m] = uhrzeit.split(":").map(Number);
  return h * 60 + m;
}
