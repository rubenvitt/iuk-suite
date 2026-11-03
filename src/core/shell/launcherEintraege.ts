import { appIconFuerKachel } from "@/core/favicon";
import { hasAnyGroup } from "@/core/groups";
import { APP_BEREICHE, BEREICH_WEITERE_APPS, VERWALTUNGSEINSTIEGE, bereichFuer, verwaltungsGruppenFor, visibleSwitcherModules } from "@/core/registry";
import { moduleUrl } from "@/core/shell/moduleUrl";
import { modulVersion } from "@/core/version";
import { dienstEintraege, launcherVorliebenVon, merkeLauncherAufruf } from "@/app/m/portal/_lib/launcher";
import type { Auswahl } from "@/core/shell/launcherAuswahl";
import type { LauncherEintrag } from "@/core/shell/types";

/**
 * DIE EINE EINSTIEGSLISTE — Suite-Module und externe Dienste in einer Form.
 *
 * KEIN `"use client"`: `SuiteHeader` ist eine Server Component und liest diese
 * Funktion. Ein `"use client"` hier ergäbe dort eine Client-Referenz statt der
 * Liste — HTTP 500 für jede Seite der Suite, und weder `build` noch Vitest
 * findet es (`docs/design/README.md`, Falle 6).
 *
 * DIE ZWEI RECHTEPRÜFUNGEN BLEIBEN GETRENNT, MIT ABSICHT. `canAccess()` steigt
 * bei `requiresAuth: false` sofort mit `true` aus — `requiredGroups` wird für
 * feedback, files und lagerbuch also NIE gelesen, weil diese Module anonyme
 * Teilpfade tragen müssen. Genau diese Lücke füllt `switcherGroupSources`.
 * Eine Vereinheitlichung zeigte entweder Einträge, die in ein `notFound()`
 * führen, oder versteckte Einträge, die erreichbar sind. Der Merge fügt
 * zusammen; er entscheidet nicht.
 */
export const ABSCHNITT_APPS = "Apps";

/**
 * Die Suite-Module für diese Session. Liest `process.env` über `moduleUrl`.
 *
 * Direkt hinter einem Modul steht sein Verwaltungseinstieg (`VERWALTUNGSEINSTIEGE` in
 * `core/registry`), wenn die Session ihn öffnen darf — sonst führte die Kachel in ein 404.
 */
export function modulEintraege(groups: string[] | null): LauncherEintrag[] {
  return visibleSwitcherModules(groups).flatMap((mod) => {
    const href = moduleUrl(mod.key);
    if (!href) return [];
    const eintrag: LauncherEintrag = {
      key: mod.key,
      title: mod.title,
      // Der NAME, nicht die Komponente — ein Name überquert die RSC-Grenze.
      icon: mod.icon,
      appIconUrl: appIconFuerKachel(mod.key),
      href,
      abschnitt: ABSCHNITT_APPS,
      bereich: bereichFuer(mod.key),
      extern: false,
    };
    const version = modulVersion(mod.key);
    const verwaltungen = VERWALTUNGSEINSTIEGE.filter(
      (v) => v.modul === mod.key && hasAnyGroup(groups, verwaltungsGruppenFor(v)),
    ).map((v) => ({
      ...eintrag,
      key: `${mod.key}:verwaltung`,
      title: v.titel,
      href: `${href}${v.pfad}`,
    }));
    // Die Version nur am Haupteintrag: an der Verwaltungskachel stünde dieselbe Zahl doppelt.
    return [version ? { ...eintrag, version } : eintrag, ...verwaltungen];
  });
}

/**
 * Apps zuerst, danach die Dienste-Kategorien in der Reihenfolge ihres ersten
 * Auftretens. Die Sortierung INNERHALB der Dienste kommt schon aus
 * `getVisibleServicesForUser` (`sortOrder`, dann `name`) und wird hier nicht
 * angetastet — diese Funktion gruppiert nur stabil.
 */
export function mischeEintraege(
  module: LauncherEintrag[],
  dienste: LauncherEintrag[],
): LauncherEintrag[] {
  const nachAbschnitt = new Map<string, LauncherEintrag[]>();
  for (const eintrag of dienste) {
    const bisher = nachAbschnitt.get(eintrag.abschnitt);
    if (bisher) bisher.push(eintrag);
    else nachAbschnitt.set(eintrag.abschnitt, [eintrag]);
  }
  return [...module, ...[...nachAbschnitt.values()].flat()];
}

export async function launcherEintraege(groups: string[] | null): Promise<LauncherEintrag[]> {
  return mischeEintraege(modulEintraege(groups), await dienstEintraege(groups));
}

/**
 * Angeheftet und Zuletzt der Person (IDA-338), und der Aufruf dieses Moduls gleich mit gemerkt.
 * Das Portal selbst zählt nicht als Aufruf: es ist der Weg zu den anderen, und „Zuletzt: Portal“
 * stünde sonst bei jedem ganz vorn.
 */
export function launcherAuswahl(personId: string | null | undefined, moduleKey: string): Auswahl {
  return moduleKey === "portal" ? launcherVorliebenVon(personId) : merkeLauncherAufruf(personId, moduleKey);
}

/** Die Bereiche in Bildschirmreihenfolge, als Zeichenketten für die Client-Inseln. */
export const BEREICHE_IN_REIHENFOLGE: readonly string[] = [...APP_BEREICHE.map((b) => b.titel), BEREICH_WEITERE_APPS];
