import { envHostsFor } from "@/core/hosts";
import { envAccessGroupsFor } from "@/core/groups";

/** Wie in `hosts.ts`: nur „String rein, String oder undefined raus" — bewusst nicht `NodeJS.ProcessEnv`. */
type EnvLike = Record<string, string | undefined>;

export type ShellVariant = "full" | "minimal" | "kiosk";

export interface ModuleDef {
  key: string;
  title: string;
  icon: string; // @ant-design/icons Komponentenname
  shell: ShellVariant;
  requiresAuth: boolean;
  /**
   * Zugang zum Modul überhaupt. Leer = jeder Eingeloggte darf.
   * Überschreibbar per `SUITE_ACCESS_GROUP_<KEY>`. Nicht direkt lesen, sondern
   * über `requiredGroupsFor()` — sonst greift die Env-Konfiguration an dieser
   * Stelle nicht (dieselbe Falle wie bei `prodHosts` unten).
   */
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
    requiresAuth: false, requiredGroups: [], adminGroups: ["iuk-qr-admin"],
    prodHosts: [], showInSwitcher: true },
  // feedback: gemischt wie qr — anonyme Teilnahme (/f/...) braucht keinen Login,
  // requiresAuth:false. Dadurch prüft canAccess() unten requiredGroups HIER
  // NIE (früher Ausstieg bei !requiresAuth) — die generische Middleware-Gate
  // (core/routing.ts + proxy.ts) gated die Verwaltung also nicht. Durchgesetzt
  // wird requiredGroups stattdessen in `_lib/requireFeedbackAccess.ts`
  // (Backstop-Guard, den beide Verwaltungs-Layouts rufen), zusammen mit der
  // Ownership-Guard (assertGroupAccess) auf den einzelnen Seiten.
  // adminGroups bleibt der Voll-Admin (alle Gruppen, via isFeedbackAdmin).
  //
  // DIE BEIDEN WERTE HIER SIND VORGABEN, KEINE FESTSCHREIBUNG: eine Instanz mit
  // anders benannten SSO-Gruppen setzt SUITE_ACCESS_GROUP_FEEDBACK (Zugang) und
  // SUITE_ADMIN_GROUP_FEEDBACK (Voll-Admin) in der .env. Beide Wege lesen über
  // requiredGroupsFor()/adminGroupsFor(), nicht diese Felder direkt.
  { key: "feedback", title: "Feedback", icon: "CommentOutlined", shell: "full",
    requiresAuth: false, requiredGroups: ["da-feedback-gl", "da-feedback-admin"],
    adminGroups: ["da-feedback-admin"], prodHosts: [], showInSwitcher: true },
  // files: zwei Prod-Hosts in EINER Variable, die Reihenfolge trägt die Rolle
  // (Index 0 = Verwaltung/Shares, Index 1 = Inbox) — siehe _lib/hostRolle.ts.
  // requiresAuth MUSS false bleiben: sonst schickt die Middleware jeden anonymen
  // /s/<id>- und /u/<token>-Aufruf in den Login (routing.ts:71-73), und zwar
  // sofort beim Cutover. Dadurch liest canAccess() requiredGroups hier NIE
  // (früher Ausstieg bei !requiresAuth, registry.ts:133) — durchgesetzt wird der
  // Zugang modul-intern in _lib/access.ts.
  //
  // prodHosts: [] — vor dem Cutover hat das Modul keine Prod-Domain, dieselbe
  // Lage wie bei qr und feedback. In Dev/E2E kommen die Hosts aus SUITE_HOST_FILES.
  // icon: NICHT „irgendein existierender @ant-design/icons-Name" — wirksam ist
  // allein die Map ICONS in `core/shell/icons.ts`. Ein Name, der dort FEHLT,
  // fällt STILL auf AppstoreOutlined zurück (einziger Konsument: SuiteNav) —
  // „Dateien" wäre dann vom „Portal" nicht zu unterscheiden, in Kopfzeile UND
  // Drawer jeder Suite-Seite.
  // FolderOutlined steht in ICONS, und die Map ist exportiert, damit
  // `SuiteNav.test.tsx` sie gegen die echte MODULES-Liste hier prüft: ein
  // Modul-Icon ohne Eintrag ist ab jetzt ein roter Test statt eines stillen
  // Duplikats.
  { key: "files", title: "Dateien", icon: "FolderOutlined", shell: "full",
    requiresAuth: false, requiredGroups: [], adminGroups: ["iuk-files-admin"],
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

/**
 * Die geltenden Zugangsgruppen eines Moduls: `SUITE_ACCESS_GROUP_<KEY>` gewinnt,
 * sonst der Registry-Wert. Anders als bei `prodHostsFor` ist eine LEER gesetzte
 * Variable KEINE Aussage, sondern wirkungslos — die Begründung steht an
 * `envAccessGroupsFor` in `core/groups` (kurz: bei `requiresAuth: true` wäre die
 * leere Liste eine stille Öffnung für alle Eingeloggten).
 *
 * Jeder Weg, der über den Modulzugang entscheidet, muss durch DIESE Funktion —
 * `canAccess()` unten und die modul-eigenen Guards (`requireFeedbackAccess`).
 */
export function requiredGroupsFor(mod: ModuleDef, env: EnvLike = process.env): string[] {
  return envAccessGroupsFor(mod.key, env) ?? mod.requiredGroups;
}

export function moduleForHost(host: string, env: EnvLike = process.env): ModuleDef | null {
  const h = host.split(":")[0].toLowerCase();
  for (const m of MODULES) {
    if (h === `${m.key}.localtest.me`) return m;
    if (prodHostsFor(m, env).some((p) => p.toLowerCase() === h)) return m;
  }
  return null;
}

export function canAccess(
  mod: ModuleDef,
  groups: string[] | null,
  env: EnvLike = process.env,
): boolean {
  if (!mod.requiresAuth) return true;
  if (groups === null) return false;
  const erlaubt = requiredGroupsFor(mod, env);
  if (erlaubt.length === 0) return true;
  return erlaubt.some((g) => groups.includes(g));
}

export function visibleSwitcherModules(
  groups: string[] | null,
  env: EnvLike = process.env,
): ModuleDef[] {
  return MODULES.filter((m) => m.showInSwitcher && canAccess(m, groups, env));
}
