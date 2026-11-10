import { visibleSwitcherModules } from "@/core/registry";
import { ALLE_NOTIZEN } from "@/app/m/portal/_lib/neuigkeiten/register";
import type { Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";
import type { Icons8Name } from "@/core/ikonen/katalog";
import type { NeuigkeitenGesehen } from "@/app/m/portal/_db/schema";
import { zeitFormat } from "@/core/zeit";
import { ALLE_APPS, neuigkeitSchluessel } from "@/app/m/portal/_lib/neuigkeiten/neu";

/** Wie in `registry.ts`: nur „String rein, String oder undefined raus". */
type EnvLike = Record<string, string | undefined>;

/**
 * Eine Notiz, angereichert um das, was die Registry über ihr Modul weiß. Der
 * Modultitel und der Icon-Name werden NICHT in der Notiz wiederholt — sie
 * stehen in `core/registry.ts` und wandern von dort mit, wenn ein Modul
 * umbenannt wird. `icon` ist der NAME aus dem Icons8-Katalog (`core/ikonen`),
 * nie eine Komponente — ein Name ist serialisierbar und überquert die
 * RSC-Grenze.
 */
export interface Neuigkeit extends Releasenotiz {
  readonly modulTitel: string;
  readonly icon: Icons8Name;
}

/**
 * DIE NOTIZEN, DIE DIESE PERSON SEHEN DARF.
 *
 * Der Maßstab ist bewusst kein eigener: sichtbar ist die Notiz zu genau den
 * Apps, die auch als Kachel im Portal stehen (`visibleSwitcherModules`). Eine
 * zweite Rechteprüfung neben dieser gäbe es sonst zu keinem anderen Zweck, als
 * mit der ersten auseinanderzulaufen — und sie liefe in beide Richtungen falsch:
 * Notizen zu Apps, die man nicht öffnen kann, sind Rauschen, und eine Notiz zu
 * einer App, die man täglich benutzt, darf nicht fehlen. Die Kachelliste
 * beantwortet genau diese Frage bereits, samt der Sonderfälle (`feedback`,
 * `files` und `lagerbuch` tragen anonyme Teilpfade und werden über
 * `switcherGroupSources` gegatet, nicht über `requiresAuth`).
 *
 * DIE FOLGE, AUSGESCHRIEBEN: ein Modul mit `showInSwitcher: false` (heute `beta`
 * und `kioskdemo`) bekommt keine Notiz angezeigt, auch wenn eine im Verzeichnis
 * läge. Das ist für Wegwerf-Module richtig. Wer ein dauerhaftes Modul aus dem
 * Umschalter nimmt und trotzdem Notizen dazu zeigen will, ändert DIESE Zeile —
 * und schreibt dazu, warum die beiden Fragen dann doch verschiedene sind.
 *
 * Rein und mit einspritzbarer Liste, damit sie ohne Registry-Umbau und ohne
 * echte Notizen prüfbar bleibt.
 */
export function neuigkeitenFuer(
  groups: string[] | null,
  notizen: readonly Releasenotiz[] = ALLE_NOTIZEN,
  env: EnvLike = process.env,
): Neuigkeit[] {
  const sichtbar = new Map(visibleSwitcherModules(groups, env).map((mod) => [mod.key, mod]));

  return notizen.flatMap((notiz) => {
    const mod = sichtbar.get(notiz.modul);
    // Kein Modul, kein Eintrag — und zwar still. Ein unbekannter Key käme gar
    // nicht bis hierher (`register.test.ts` prüft jede Notiz gegen `MODULES`);
    // was hier ausfällt, ist der geschlossene Zugang, und der ist kein Fehler,
    // über den jemand etwas erfahren müsste.
    if (!mod) return [];
    return [{ ...notiz, modulTitel: mod.title, icon: mod.icon }];
  });
}

/*
 * SEITENWEISE (IDA-391). Alle Notizen auf einmal waren am Telefon über 50 000px hoch. Der Server
 * liefert deshalb nur eine erste Seite, „Ältere anzeigen" holt die nächste per Server Action — die
 * Liste wandert nicht ins Client-Bundle, und die Rechteprüfung (`neuigkeitenFuer`) läuft bei jedem
 * Nachladen erneut auf dem Server. Alles hier ist rein und ohne `"use client"` (Falle 6).
 */

/** Einträge je Seite — genug für einige Wochen, wenig genug fürs Telefon. */
export const NEUIGKEITEN_SEITE = 20;

export interface NeuigkeitenSeite {
  eintraege: Neuigkeit[];
  /** Gibt es hinter dieser Seite noch ältere Einträge (im selben Filter)? */
  weitere: boolean;
}

export interface NeuigkeitenApp {
  key: string;
  titel: string;
  anzahl: number;
}

/** Die Apps mit Notizen, in der Reihenfolge des ersten Auftretens — die zuletzt geänderte vorn. */
export function appsAus(alle: readonly Neuigkeit[]): NeuigkeitenApp[] {
  const apps = new Map<string, NeuigkeitenApp>();
  for (const n of alle) {
    const app = apps.get(n.modul);
    if (app) app.anzahl += 1;
    else apps.set(n.modul, { key: n.modul, titel: n.modulTitel, anzahl: 1 });
  }
  return [...apps.values()];
}

/**
 * Die Einträge `ab` bis `ab + anzahl` im Filter `modul`. Ein unbekannter Filter ergibt eine leere
 * Seite statt aller Notizen — er kommt aus einem Aufruf und ist nicht vertrauenswürdig.
 */
export function seiteAus(
  alle: readonly Neuigkeit[],
  modul: string,
  ab: number,
  anzahl: number = NEUIGKEITEN_SEITE,
): NeuigkeitenSeite {
  const gefiltert = modul === ALLE_APPS ? alle : alle.filter((n) => n.modul === modul);
  const start = Math.max(0, Math.floor(ab));
  return { eintraege: gefiltert.slice(start, start + anzahl), weitere: gefiltert.length > start + anzahl };
}

/**
 * Alle Einträge (ohne Filter) bis einschließlich der Notiz `slug`, auf ganze Seiten aufgerundet — für
 * eine Sprungmarke `/neuigkeiten#<slug>` auf eine ältere Notiz. `null`, wenn es die Notiz hier nicht gibt.
 */
export function seiteBis(alle: readonly Neuigkeit[], slug: string): NeuigkeitenSeite | null {
  const i = alle.findIndex((n) => n.slug === slug);
  if (i < 0) return null;
  const anzahl = Math.ceil((i + 1) / NEUIGKEITEN_SEITE) * NEUIGKEITEN_SEITE;
  return seiteAus(alle, ALLE_APPS, 0, anzahl);
}

/*
 * NEU SEIT DEM LETZTEN BESUCH. Gemerkt wird das jüngste Notizdatum beim Besuch und die Notizen genau
 * dieses Tages (`NeuigkeitenGesehen` in `_db/schema.ts`). Neu ist, was danach liegt oder an jenem Tag
 * noch nicht dabei war.
 */

/** Ohne gemerkten Besuch gelten die Notizen seit so vielen Tagen (Stichtag eingeschlossen) als neu. */
export const ERSTBESUCH_TAGE = 14;

/** `YYYY-MM-DD` minus `tage`, kalendarisch (UTC-Mitternacht, keine Zone im Spiel). */
export function tageZurueck(isoTag: string, tage: number): string {
  const [j, m, t] = isoTag.split("-").map(Number);
  return new Date(Date.UTC(j, m - 1, t - tage)).toISOString().slice(0, 10);
}

const TAG = zeitFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" });

/** Heute in der Suite-Zone als `YYYY-MM-DD`. */
export function heuteIso(jetzt: Date = new Date()): string {
  return TAG.format(jetzt);
}

/**
 * Der Vergleichsstand für die Anzeige. BEIM ERSTEN BESUCH (kein Wert) gelten die Notizen der letzten
 * `ERSTBESUCH_TAGE` Tage als neu — weder nichts noch alles: Nach dem Rollout haben ALLE noch keinen
 * Wert, und „nichts neu" verschwiege ihnen gerade die jüngsten Änderungen; „alles neu" wären über
 * hundert Chips und damit keine Auskunft mehr. Zwei Wochen decken den Abstand ab, in dem die meisten
 * wiederkommen, und sind auf einer Seite zu überblicken.
 */
export function vergleichsStand(gesehen: NeuigkeitenGesehen | null, heute: string): NeuigkeitenGesehen {
  return gesehen ?? { bis: tageZurueck(heute, ERSTBESUCH_TAGE), schluessel: [] };
}

/** Der Stand, den ein Besuch hinterlässt: das jüngste Datum und alle Notizen dieses Tages. */
export function gesehenNach(alle: readonly Neuigkeit[]): NeuigkeitenGesehen | null {
  if (alle.length === 0) return null;
  const bis = alle.reduce((max, n) => (n.datum > max ? n.datum : max), alle[0].datum);
  return { bis, schluessel: alle.filter((n) => n.datum === bis).map(neuigkeitSchluessel) };
}
