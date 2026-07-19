import { envHostsFor } from "@/core/hosts";

export type ShellVariant = "full" | "minimal" | "kiosk";

export interface ModuleDef {
  key: string;
  title: string;
  icon: string; // lucide icon name
  shell: ShellVariant;
  requiresAuth: boolean;
  requiredGroups: string[];
  /**
   * Fallback-Hosts, wenn `SUITE_HOST_<KEY>` nicht gesetzt ist. Nicht direkt
   * lesen — immer über `prodHostsFor()`, sonst greift die Env-Konfiguration an
   * dieser Stelle nicht (genau so entstand Post-Cutover-Befund 2, als der
   * App-Switcher an der Registry vorbei baute).
   */
  prodHosts: string[];
  showInSwitcher: boolean;
}

// Wegwerf-Module (alpha/beta/kioskdemo) beweisen den Keystone; portal ist das erste echte Modul.
export const MODULES: ModuleDef[] = [
  { key: "portal", title: "Portal", icon: "LayoutGrid", shell: "full",
    requiresAuth: true, requiredGroups: [], prodHosts: ["iuk-ue.de"], showInSwitcher: true },
  { key: "alpha", title: "Alpha", icon: "Square", shell: "full",
    requiresAuth: true, requiredGroups: ["alpha-users"], prodHosts: [], showInSwitcher: true },
  // gamma: authentifiziertes Voll-Shell-Modul ohne Gruppenzwang — SSO-Cross-Ziel im Keystone-E2E.
  { key: "gamma", title: "Gamma", icon: "Triangle", shell: "full",
    requiresAuth: true, requiredGroups: [], prodHosts: [], showInSwitcher: true },
  { key: "beta", title: "Beta", icon: "Circle", shell: "minimal",
    requiresAuth: false, requiredGroups: [], prodHosts: [], showInSwitcher: false },
  { key: "kioskdemo", title: "Kiosk Demo", icon: "Monitor", shell: "kiosk",
    requiresAuth: false, requiredGroups: [], prodHosts: [], showInSwitcher: false },
];

const BY_KEY = new Map(MODULES.map((m) => [m.key, m]));

export function getModule(key: string): ModuleDef {
  const m = BY_KEY.get(key);
  if (!m) throw new Error(`Unknown module: ${key}`);
  return m;
}

/** Wie getModule, wirft aber nicht — für Keys aus ungeprüftem Input (z. B. URL-Segmenten). */
export function findModule(key: string): ModuleDef | null {
  return BY_KEY.get(key) ?? null;
}

/**
 * Die geltenden Prod-Hosts eines Moduls: `SUITE_HOST_<KEY>` gewinnt, sonst der
 * Fallback aus der Registry. Eine leer gesetzte Variable heißt bewusst „keine
 * Prod-Hosts" — damit lässt sich ein Cutover ohne Rebuild zurücknehmen.
 */
export function prodHostsFor(mod: ModuleDef): string[] {
  return envHostsFor(mod.key) ?? mod.prodHosts;
}

export function moduleForHost(host: string): ModuleDef | null {
  const h = host.split(":")[0].toLowerCase();
  for (const m of MODULES) {
    if (h === `${m.key}.localtest.me`) return m;
    if (prodHostsFor(m).some((p) => p.toLowerCase() === h)) return m;
  }
  return null;
}

export function canAccess(mod: ModuleDef, groups: string[] | null): boolean {
  if (!mod.requiresAuth) return true;
  if (groups === null) return false;
  if (mod.requiredGroups.length === 0) return true;
  return mod.requiredGroups.some((g) => groups.includes(g));
}

export function visibleSwitcherModules(groups: string[] | null): ModuleDef[] {
  return MODULES.filter((m) => m.showInSwitcher && canAccess(m, groups));
}
