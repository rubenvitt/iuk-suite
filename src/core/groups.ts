import type { ModuleDef } from "@/core/registry";

/**
 * Admin-Gruppen pro Modul — wiederverwendbar statt pro Modul neu.
 *
 * Vorher stand die Gruppenprüfung zweimal fast identisch im Code
 * (`core/auth/index.ts` für `session.user.isAdmin`, `portal/_lib/rbac.ts` für
 * das Portal-Gating), und jedes weitere Modul hätte sie ein drittes Mal
 * geschrieben. Spätestens mit `qr` geht das nicht mehr auf: dessen Admins
 * sitzen in `drk-qr-admin`, nicht in der Portal-Gruppe.
 *
 * Zwei Ebenen:
 * - **Suite-Admin** (`ADMIN_GROUP`, Default `dashboard-admins`) — der
 *   Betreiber. Ist überall Admin, damit ein Modul nicht aussperrbar ist.
 * - **Modul-Admin** (`ModuleDef.adminGroups`, überschreibbar per
 *   `SUITE_ADMIN_GROUP_<KEY>`) — administriert genau ein Modul.
 *
 * Die Env-Überschreibung folgt demselben Muster wie `SUITE_HOST_<KEY>`: eine
 * Gruppe umzuhängen ist damit eine `.env`-Zeile, kein Rebuild.
 */

type EnvLike = Record<string, string | undefined>;

const PREFIX = "SUITE_ADMIN_GROUP_";

export function adminGroupEnvName(key: string): string {
  return PREFIX + key.toUpperCase().replace(/-/g, "_");
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
 */
export function validateGroupConfig(moduleKeys: string[], env: EnvLike = process.env): string[] {
  const known = new Set(moduleKeys.map(adminGroupEnvName));
  return Object.keys(env)
    .filter((name) => name.startsWith(PREFIX) && !known.has(name))
    .map(
      (name) =>
        `${name} passt zu keinem Modul. Bekannt: ${[...known].sort().join(", ")}`,
    );
}
