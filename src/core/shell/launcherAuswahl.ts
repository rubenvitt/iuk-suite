import type { LauncherEintrag } from "@/core/shell/types";

/**
 * DIE PERSÖNLICHE ORDNUNG DES LAUNCHERS (IDA-338) — für die Portal-Startseite (`DiensteRaster`) und
 * den App-Umschalter der Kopfzeile (`AppUmschalter`). Zwei Anwender in zwei Modulen, deshalb `core`.
 *
 * Wer wenige Einträge sieht, bekommt die Liste wie bisher. Erst ab `VIELE_EINTRAEGE_AB` stehen oben
 * „Angeheftet“ und „Zuletzt“, und der Rest wandert hinter „Alle Apps & Dienste“, nach fachlichen
 * Bereichen geordnet (`APP_BEREICHE` in `core/registry`).
 *
 * KEIN `"use client"`: die Funktionen sind rein und laufen auf beiden Seiten (Falle 6).
 */
export const VIELE_EINTRAEGE_AB = 13;
/** So viele zuletzt geöffnete Einträge stehen unter „Zuletzt“ (ohne die angehefteten). */
export const ZULETZT_ZEIGEN = 4;

const VERWALTUNG = ":verwaltung";

export interface Auswahl {
  angeheftet: string[];
  zuletzt: string[];
}

/** Ein Eintrag mit seinem Verwaltungseinstieg als Zweitlink statt als eigener Kachel. */
export interface GeordneterEintrag extends LauncherEintrag {
  verwaltung?: { titel: string; href: string };
}

export function istViel(eintraege: readonly LauncherEintrag[]): boolean {
  return eintraege.length >= VIELE_EINTRAEGE_AB;
}

/** Hängt jeden `<modul>:verwaltung`-Eintrag an sein Modul; ohne Modul bleibt er für sich stehen. */
export function mitVerwaltungAmModul(eintraege: readonly LauncherEintrag[]): GeordneterEintrag[] {
  const keys = new Set(eintraege.map((e) => e.key));
  const verwaltungen = new Map<string, LauncherEintrag>();
  for (const e of eintraege) {
    if (e.key.endsWith(VERWALTUNG) && keys.has(e.key.slice(0, -VERWALTUNG.length))) {
      verwaltungen.set(e.key.slice(0, -VERWALTUNG.length), e);
    }
  }
  return eintraege
    .filter((e) => !(e.key.endsWith(VERWALTUNG) && verwaltungen.has(e.key.slice(0, -VERWALTUNG.length))))
    .map((e) => {
      const v = verwaltungen.get(e.key);
      return v ? { ...e, verwaltung: { titel: v.title, href: v.href } } : e;
    });
}

/** Die Einträge zu den Schlüsseln, in deren Reihenfolge; Unsichtbares fällt still heraus. */
export function nachSchluesseln<T extends LauncherEintrag>(eintraege: readonly T[], keys: readonly string[]): T[] {
  const nachKey = new Map(eintraege.map((e) => [e.key, e]));
  return [...new Set(keys)].flatMap((k) => {
    const e = nachKey.get(k);
    return e ? [e] : [];
  });
}

export interface PersoenlicheListen<T extends LauncherEintrag> {
  angeheftet: T[];
  zuletzt: T[];
}

export function persoenlich<T extends LauncherEintrag>(eintraege: readonly T[], auswahl: Auswahl): PersoenlicheListen<T> {
  const angeheftet = nachSchluesseln(eintraege, auswahl.angeheftet);
  const schon = new Set(angeheftet.map((e) => e.key));
  const zuletzt = nachSchluesseln(eintraege, auswahl.zuletzt.filter((k) => !schon.has(k))).slice(0, ZULETZT_ZEIGEN);
  return { angeheftet, zuletzt };
}

function gruppiere<T>(liste: readonly T[], nach: (e: T) => string): [string, T[]][] {
  const map = new Map<string, T[]>();
  for (const e of liste) {
    const titel = nach(e);
    const bisher = map.get(titel);
    if (bisher) bisher.push(e);
    else map.set(titel, [e]);
  }
  return [...map.entries()];
}

/**
 * „Alle Apps & Dienste“: Suite-Module nach Bereich, Dienste nach ihrer Kategorie. Die Reihenfolge
 * der Module kommt schon aus der Registry, die Bereiche ordnet `bereichReihenfolge`.
 */
export function ordneAlle<T extends LauncherEintrag>(
  eintraege: readonly T[],
  bereichReihenfolge: readonly string[],
): { apps: [string, T[]][]; dienste: [string, T[]][] } {
  const suiteModule = eintraege.filter((e) => !e.extern && e.bereich);
  const dienste = eintraege.filter((e) => e.extern || !e.bereich);
  const rang = (titel: string) => {
    const i = bereichReihenfolge.indexOf(titel);
    return i === -1 ? bereichReihenfolge.length : i;
  };
  const apps = gruppiere(suiteModule, (e) => e.bereich!).sort(([a], [b]) => rang(a) - rang(b));
  return { apps, dienste: gruppiere(dienste, (e) => e.abschnitt) };
}
