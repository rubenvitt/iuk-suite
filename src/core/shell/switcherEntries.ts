import { visibleSwitcherModules } from "@/core/registry";
import { moduleUrl } from "@/core/shell/moduleUrl";
import type { AppSwitcherEntry } from "@/core/shell/AppSwitcher";

/**
 * Switcher-Einträge für eine Session: nach Gruppen gefiltert (Registry) und um
 * Module bereinigt, die unter keiner URL erreichbar sind (siehe moduleUrl).
 * Server-seitig aufzurufen — moduleUrl liest env, die im Client-Bundle fehlt.
 */
export function switcherEntries(groups: string[] | null): AppSwitcherEntry[] {
  return visibleSwitcherModules(groups).flatMap((m) => {
    const href = moduleUrl(m.key);
    return href ? [{ key: m.key, title: m.title, icon: m.icon, href }] : [];
  });
}
