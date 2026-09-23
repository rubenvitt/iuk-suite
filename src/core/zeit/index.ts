/**
 * DIE ANZEIGEZONE DER SUITE — eine Stelle für alle Module (DRK-469).
 *
 * Bis hierher trug jedes Modul seine eigene Konstante `"Europe/Berlin"`
 * (`feedback`, `files`, `lagerbuch`, `radio`, `aufgaben`, `uav`,
 * `core/export`). Das Audit-Log zeigte UTC, das Profil die Zone des Geräts. Jetzt
 * stellt die Portal-Verwaltung die Zone ein (`portal/_lib/einstellungen.ts`,
 * Schlüssel `zeitzone`). Der Standard bleibt `Europe/Berlin`.
 *
 * KEIN "use client" und keine Server-Abhängigkeit: Server Components, Route
 * Handler UND Client-Inseln lesen diese Datei (Falle 6). Woher die Zone kommt,
 * hängt am Laufort:
 *
 *   - SERVER: ein prozessweiter Speicher auf `globalThis`. Der Boot lädt ihn aus
 *     der Datenbank (`core/bootstrap.ts`, `ladeSuiteEinstellungen`), die
 *     Speicher-Action der Verwaltung setzt ihn nach. `globalThis` statt einer
 *     Modulvariable, weil Next dieselbe Datei in mehrere Bundles übersetzt
 *     (Instrumentation, RSC, SSR). Jedes davon hätte sonst seine eigene Kopie.
 *   - BROWSER: `<html data-zeitzone>`. Das Root-Layout stempelt die Zone mit,
 *     so wie `data-theme`. Deshalb rechnet die Hydration mit derselben Zone wie
 *     das Server-HTML.
 *
 * ⚠️ KEIN `new Intl.DateTimeFormat({ timeZone })` AUF MODULEBENE. So ein
 * Formatierer friert die Zone beim Import ein. Nach einem Wechsel in der
 * Verwaltung zeigte er bis zum Neustart die alte Zone an, und kein Test sähe
 * das. Dafür gibt es `zeitFormat` unten.
 *
 * ⚠️ DIE ZONE BESTIMMT AUCH TAGESGRENZEN, nicht nur die Anzeige: Fristenden in
 * `feedback`, Tagesfilter im `lagerbuch`-Journal, Kalendertage in `aufgaben`
 * und `radio`. Ein Wechsel verschiebt diese Grenzen auch für schon
 * gespeicherte Daten. Der Hilfetext in der Verwaltung sagt das.
 */

export const STANDARD_ZEITZONE = "Europe/Berlin";

const SPEICHER = Symbol.for("iuk-suite.zeitzone");

type Speicher = { zone: string };

function speicher(): Speicher {
  const g = globalThis as { [SPEICHER]?: Speicher };
  return (g[SPEICHER] ??= { zone: STANDARD_ZEITZONE });
}

/** Wahr, wenn `Intl` die Zone kennt. Ein Tippfehler wirft sonst erst beim Formatieren. */
export function istGueltigeZeitzone(zone: string): boolean {
  if (!zone) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Die Zonen, die die Verwaltung anbietet, als IANA-Namen. `UTC` kommt dazu,
 * weil V8 sie nicht in `supportedValuesOf` führt, sie für einen Betrieb ohne
 * Sommerzeit aber eine vernünftige Wahl ist.
 */
export function waehlbareZeitzonen(): string[] {
  const liste = Intl.supportedValuesOf("timeZone");
  return liste.includes("UTC") ? liste : [...liste, "UTC"];
}

/** Die Anzeigezone, die gerade gilt. Siehe den Kopfkommentar zur Herkunft. */
export function zeitzone(): string {
  if (typeof document !== "undefined") {
    const gestempelt = document.documentElement.dataset.zeitzone;
    if (gestempelt && istGueltigeZeitzone(gestempelt)) return gestempelt;
  }
  return speicher().zone;
}

/**
 * Setzt die prozessweite Zone. Nur der Boot und die Speicher-Action der
 * Verwaltung rufen das auf. Eine ungültige Zone wirft, damit sie nicht still
 * auf die alte zurückfällt.
 */
export function setzeAktiveZeitzone(zone: string): void {
  if (!istGueltigeZeitzone(zone)) throw new Error(`Unbekannte Zeitzone: ${zone}`);
  speicher().zone = zone;
}

/** Formatierer mit der Schnittstelle von `Intl.DateTimeFormat`, soweit die Suite sie braucht. */
export type ZeitFormat = {
  format(datum?: Date | number): string;
  formatToParts(datum?: Date | number): Intl.DateTimeFormatPart[];
};

/**
 * Wie `new Intl.DateTimeFormat(locale, { ...optionen, timeZone: zeitzone() })`,
 * nur dass die Zone erst beim Formatieren aufgelöst wird. Ein Aufruf auf
 * Modulebene bleibt also richtig, wenn die Zone später wechselt.
 * Der teure `Intl`-Aufbau passiert einmal je Zone und nicht je Zeile.
 */
export function zeitFormat(
  locale: string,
  optionen: Omit<Intl.DateTimeFormatOptions, "timeZone">,
): ZeitFormat {
  let fuerZone = "";
  let intl: Intl.DateTimeFormat | null = null;
  const aktuell = (): Intl.DateTimeFormat => {
    const zone = zeitzone();
    if (intl === null || zone !== fuerZone) {
      intl = new Intl.DateTimeFormat(locale, { ...optionen, timeZone: zone });
      fuerZone = zone;
    }
    return intl;
  };
  return {
    format: (datum) => aktuell().format(datum),
    formatToParts: (datum) => aktuell().formatToParts(datum),
  };
}

const TEILE = zeitFormat("en-CA", {
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** Abstand der Suite-Zone zu UTC zum Zeitpunkt `ms`, in Millisekunden (östlich positiv). */
function versatzMs(ms: number): number {
  const p = Object.fromEntries(TEILE.formatToParts(ms).map((t) => [t.type, t.value]));
  // `% 24`: manche ICU-Fassungen liefern trotz `h23` für Mitternacht die 24.
  const alsUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return alsUtc - (ms - (((ms % 1000) + 1000) % 1000));
}

/** Mitternacht des Kalendertags `jahr-monat-tag` in der Suite-Zone als Zeitpunkt (ms). */
function mitternacht(jahr: number, monat: number, tag: number): number {
  const naiv = Date.UTC(jahr, monat - 1, tag);
  const erster = naiv - versatzMs(naiv);
  // Zweiter Schritt, falls zwischen `naiv` und `erster` eine Umstellung liegt.
  return naiv - versatzMs(erster);
}

/**
 * Anfang und Ende (inklusive, auf die Millisekunde) des Kalendertags `YYYY-MM-DD`
 * in der Suite-Zone. Ein Tag mit Zeitumstellung dauert 23 oder 25 Stunden, und
 * genau das ist gewollt: gefiltert wird nach dem Tag, den die Uhr an der Wand zeigt.
 */
export function tagesGrenzenInZone(isoTag: string): { von: number; bis: number } {
  const [jahr, monat, tag] = isoTag.split("-").map(Number);
  return { von: mitternacht(jahr, monat, tag), bis: mitternacht(jahr, monat, tag + 1) - 1 };
}
