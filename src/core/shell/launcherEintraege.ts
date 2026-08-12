import { visibleSwitcherModules } from "@/core/registry";
import { moduleUrl } from "@/core/shell/moduleUrl";
import { dienstEintraege } from "@/app/m/portal/_lib/launcher";
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

/** Die Suite-Module für diese Session. Liest `process.env` über `moduleUrl`. */
export function modulEintraege(groups: string[] | null): LauncherEintrag[] {
  return visibleSwitcherModules(groups).flatMap((mod) => {
    const href = moduleUrl(mod.key);
    if (!href) return [];
    return [
      {
        key: mod.key,
        title: mod.title,
        // Der NAME, nicht die Komponente — aufgelöst wird nur in Client-Inseln.
        icon: mod.icon,
        href,
        abschnitt: ABSCHNITT_APPS,
        extern: false,
      },
    ];
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
