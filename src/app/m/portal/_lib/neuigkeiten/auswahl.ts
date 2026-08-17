import { visibleSwitcherModules } from "@/core/registry";
import { ALLE_NOTIZEN } from "@/app/m/portal/_lib/neuigkeiten/register";
import type { Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

/** Wie in `registry.ts`: nur „String rein, String oder undefined raus". */
type EnvLike = Record<string, string | undefined>;

/**
 * Eine Notiz, angereichert um das, was die Registry über ihr Modul weiß. Der
 * Modultitel und der Icon-Name werden NICHT in der Notiz wiederholt — sie
 * stehen in `core/registry.ts` und wandern von dort mit, wenn ein Modul
 * umbenannt wird. `icon` ist der NAME aus der `ICONS`-Map, nie eine Komponente:
 * aufgelöst wird ausschließlich in Client-Inseln (`docs/design/README.md`,
 * Falle 7).
 */
export interface Neuigkeit extends Releasenotiz {
  readonly modulTitel: string;
  readonly icon: string;
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
