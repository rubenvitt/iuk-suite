import type { ModuleDef } from "@/core/registry";

/**
 * Admin-Gruppen pro Modul — wiederverwendbar statt pro Modul neu.
 *
 * Vorher stand die Gruppenprüfung zweimal fast identisch im Code
 * (`core/auth/index.ts` für `session.user.isAdmin`, `portal/_lib/rbac.ts` für
 * das Portal-Gating), und jedes weitere Modul hätte sie ein drittes Mal
 * geschrieben. Spätestens mit `qr` geht das nicht mehr auf: dessen Admins
 * sitzen in `iuk-qr-admin`, nicht in der Portal-Gruppe.
 *
 * Drei Ebenen:
 * - **Suite-Admin** (`ADMIN_GROUP`, Default `dashboard-admins`) — der
 *   Betreiber. Ist überall Admin, damit ein Modul nicht aussperrbar ist.
 * - **Modul-Admin** (`ModuleDef.adminGroups`, überschreibbar per
 *   `SUITE_ADMIN_GROUP_<KEY>`) — administriert genau ein Modul.
 * - **Modul-Zugang** (`ModuleDef.requiredGroups`, überschreibbar per
 *   `SUITE_ACCESS_GROUP_<KEY>`) — darf das Modul überhaupt benutzen, ohne es zu
 *   administrieren. Gelesen wird das Feld über `requiredGroupsFor()` in
 *   `core/registry` — nie direkt, sonst greift die Env-Konfiguration nicht.
 *
 * Die Env-Überschreibung folgt demselben Muster wie `SUITE_HOST_<KEY>`: eine
 * Gruppe umzuhängen ist damit eine `.env`-Zeile, kein Rebuild.
 */

type EnvLike = Record<string, string | undefined>;

const ADMIN_PREFIX = "SUITE_ADMIN_GROUP_";
const ACCESS_PREFIX = "SUITE_ACCESS_GROUP_";

/** `feedback` → `FEEDBACK`, `my-mod` → `MY_MOD`. Beide Präfixe teilen sie. */
function envSuffix(key: string): string {
  return key.toUpperCase().replace(/-/g, "_");
}

export function adminGroupEnvName(key: string): string {
  return ADMIN_PREFIX + envSuffix(key);
}

export function accessGroupEnvName(key: string): string {
  return ACCESS_PREFIX + envSuffix(key);
}

/**
 * Die Zugangsgruppen aus der Env — oder `null` für „nicht konfiguriert".
 *
 * WARUM HIER `null` UND NICHT DIE LEERE LISTE, anders als bei
 * `SUITE_HOST_<KEY>` und `SUITE_ADMIN_GROUP_<KEY>`: dort ist eine leer gesetzte
 * Variable eine sinnvolle Aussage und in beiden Fällen die RESTRIKTIVERE („keine
 * Prod-Hosts", also Cutover zurücknehmen; „keine modul-eigenen Admins", also nur
 * der Suite-Admin). Bei einer Zugangsliste ist es das Gegenteil, und zwar je
 * Modul verschieden:
 *   - `requiresAuth: true` (z. B. `alpha`): `canAccess` steigt bei einer leeren
 *     Liste mit `true` aus — jeder Eingeloggte käme rein. Eine ÖFFNUNG.
 *   - `requiresAuth: false` (z. B. `feedback`): `canAccess` liest das Feld nie,
 *     durchgesetzt wird es im Verwaltungs-Layout — dort schließt eine leere Liste
 *     alle außer den Admins aus.
 * Eine Variable, die jemand beim Editieren der `.env` leer zurücklässt, darf kein
 * Modul für alle öffnen. Deshalb: leer = kein Override, der Registry-Wert gilt
 * weiter. Damit das nicht STILL passiert, meldet `validateGroupConfig` eine leer
 * gesetzte Variable als Konfigurationsfehler.
 */
export function envAccessGroupsFor(key: string, env: EnvLike = process.env): string[] | null {
  const raw = env[accessGroupEnvName(key)];
  if (raw === undefined) return null;
  const namen = raw
    .split(",")
    .map((g) => g.trim())
    .filter(Boolean);
  return namen.length === 0 ? null : namen;
}

/** Suite-weite Admin-Gruppe. `ADMIN_GROUP` ohne Präfix — der Name ist historisch
 *  und steht so auf dem Server; nicht umbenennen ohne .env-Migration. */
export function suiteAdminGroup(env: EnvLike = process.env): string {
  return env.ADMIN_GROUP ?? "dashboard-admins";
}

/** Modul-Admin-Gruppen: Env gewinnt, sonst der Registry-Wert. Leer gesetzt
 *  heißt „keine modul-eigenen Admins" — dann bleibt nur der Suite-Admin. */
export function adminGroupsFor(mod: ModuleDef, env: EnvLike = process.env): string[] {
  const raw = env[adminGroupEnvName(mod.key)];
  if (raw === undefined) return mod.adminGroups;
  return raw
    .split(",")
    .map((g) => g.trim())
    .filter(Boolean);
}

/**
 * Darf dieser Nutzer das Modul administrieren?
 *
 * `groups === null` heißt „nicht eingeloggt" und ist nie Admin — wichtig, weil
 * anonyme Module (wie `qr`) Server Components ohne Session rendern und ein
 * `[].includes()` auf `undefined` sonst still zu `false` würde, ohne dass der
 * Unterschied zwischen „anonym" und „eingeloggt ohne Recht" je auffiele.
 */
export function isModuleAdmin(
  mod: ModuleDef,
  groups: string[] | null | undefined,
  env: EnvLike = process.env,
): boolean {
  if (!groups) return false;
  if (groups.includes(suiteAdminGroup(env))) return true;
  return adminGroupsFor(mod, env).some((g) => groups.includes(g));
}

/**
 * Prüft die Gruppen-Konfiguration gegen die bekannten Module — analog zu
 * `validateHostConfig`. Ein `SUITE_ADMIN_GROUP_QRR` wäre sonst wirkungslos und
 * niemand fiele es auf, bis jemand vergeblich versucht zu administrieren.
 *
 * Beide Präfixe laufen durch DIESE Funktion, damit `bootstrap.ts` eine einzige
 * Aufrufstelle behält. Zusätzlich zum Tippfehler wird die LEER GESETZTE
 * Zugangsvariable gemeldet: sie ist bewusst wirkungslos (siehe
 * `envAccessGroupsFor`), und „wirkungslos ohne ein Wort" ist genau der Zustand,
 * gegen den diese Prüfung steht. Bei den Admin-Gruppen ist leer dagegen eine
 * gültige Aussage und wird nicht gemeldet.
 */
export function validateGroupConfig(moduleKeys: string[], env: EnvLike = process.env): string[] {
  const adminNames = new Set(moduleKeys.map(adminGroupEnvName));
  const accessNames = new Set(moduleKeys.map(accessGroupEnvName));
  const fehler: string[] = [];

  for (const name of Object.keys(env)) {
    const istAdmin = name.startsWith(ADMIN_PREFIX);
    const istAccess = name.startsWith(ACCESS_PREFIX);
    if (!istAdmin && !istAccess) continue;

    const bekannt = istAdmin ? adminNames : accessNames;
    if (!bekannt.has(name)) {
      fehler.push(`${name} passt zu keinem Modul. Bekannt: ${[...bekannt].sort().join(", ")}`);
      continue;
    }
    if (istAccess && env[name]?.trim() === "") {
      fehler.push(
        `${name} ist leer gesetzt und damit wirkungslos — der Registry-Wert gilt weiter. ` +
          `Entweder Gruppen eintragen (kommagetrennt) oder die Zeile entfernen.`,
      );
    }
  }
  return fehler;
}
