import { envHostsFor } from "@/core/hosts";

/** Wie in `hosts.ts`: nur „String rein, String oder undefined raus" — bewusst nicht `NodeJS.ProcessEnv`. */
type EnvLike = Record<string, string | undefined>;

export type ShellVariant = "full" | "minimal" | "kiosk";

export interface ModuleDef {
  key: string;
  title: string;
  icon: string; // @ant-design/icons Komponentenname
  shell: ShellVariant;
  requiresAuth: boolean;
  /** Zugang zum Modul überhaupt. Leer = jeder Eingeloggte darf. */
  requiredGroups: string[];
  /**
   * Wer das Modul **administrieren** darf — zusätzlich zum Suite-Admin, der
   * überall darf. Überschreibbar per `SUITE_ADMIN_GROUP_<KEY>`.
   * Nicht direkt lesen, sondern über `isModuleAdmin()` aus `core/groups`.
   */
  adminGroups: string[];
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
  // portal: keine modul-eigene Admin-Gruppe — Admin ist hier der Suite-Admin
  // (ADMIN_GROUP). Das ist genau das bisherige Verhalten, nur nicht mehr im
  // Modul dupliziert.
  { key: "portal", title: "Portal", icon: "AppstoreOutlined", shell: "full",
    requiresAuth: true, requiredGroups: [], adminGroups: [],
    prodHosts: ["iuk-ue.de"], showInSwitcher: true },
  // Anonym, weil der Generator ohne Login funktionieren muss (Offline-PWA im
  // Einsatz). Der Admin-Bereich schützt sich selbst über core/auth/guards —
  // requiresAuth: true wäre hier falsch und würde den anonymen Zugang nehmen.
  { key: "qr", title: "QR-Codes", icon: "QrcodeOutlined", shell: "minimal",
    requiresAuth: false, requiredGroups: [], adminGroups: ["drk-qr-admin"],
    prodHosts: [], showInSwitcher: true },
  { key: "alpha", title: "Alpha", icon: "BorderOutlined", shell: "full",
    requiresAuth: true, requiredGroups: ["alpha-users"], adminGroups: [],
    prodHosts: [], showInSwitcher: true },
  // gamma: authentifiziertes Voll-Shell-Modul ohne Gruppenzwang — SSO-Cross-Ziel im Keystone-E2E.
  { key: "gamma", title: "Gamma", icon: "CaretUpOutlined", shell: "full",
    requiresAuth: true, requiredGroups: [], adminGroups: [],
    prodHosts: [], showInSwitcher: true },
  { key: "beta", title: "Beta", icon: "GlobalOutlined", shell: "minimal",
    requiresAuth: false, requiredGroups: [], adminGroups: [],
    prodHosts: [], showInSwitcher: false },
  { key: "kioskdemo", title: "Kiosk Demo", icon: "DesktopOutlined", shell: "kiosk",
    requiresAuth: false, requiredGroups: [], adminGroups: [],
    prodHosts: [], showInSwitcher: false },
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
export function prodHostsFor(mod: ModuleDef, env: EnvLike = process.env): string[] {
  return envHostsFor(mod.key, env) ?? mod.prodHosts;
}

export function moduleForHost(host: string, env: EnvLike = process.env): ModuleDef | null {
  const h = host.split(":")[0].toLowerCase();
  for (const m of MODULES) {
    if (h === `${m.key}.localtest.me`) return m;
    if (prodHostsFor(m, env).some((p) => p.toLowerCase() === h)) return m;
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
