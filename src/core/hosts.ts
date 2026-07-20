/**
 * Prod-Hosts der Module aus der Umgebung statt aus dem Code.
 *
 * Warum: Bis hierher war die Domain eines Moduls ein Eintrag in `registry.ts`.
 * Jeder Cutover brauchte damit einen Commit, einen CI-Lauf und ein neues Image —
 * und ein Rollback ebenso. Mit `SUITE_HOST_<KEY>` ist ein Cutover eine
 * Env-Änderung plus `docker compose up -d`, ein Rollback das Zurücksetzen
 * derselben Variable.
 *
 * Gemessen (19.07.2026): die Middleware löst `process.env` zur Laufzeit auf,
 * literaler wie dynamischer Zugriff — Next inlined hier nichts zur Build-Zeit.
 * Ohne das würde das ganze Konstrukt still auf die Build-Zeit-Werte zurückfallen.
 *
 * Ein **einheitliches Präfix** (statt `QR_HOST`, `FILES_HOST`, …) ist Absicht:
 * nur so lassen sich alle gesetzten Variablen einsammeln und gegen die bekannten
 * Modul-Keys prüfen. Ein Tippfehler wie `SUITE_HOST_QRR` wäre sonst einfach
 * wirkungslos — und das Modul liefe unbemerkt weiter unter dem Portal-Fallback.
 */

const PREFIX = "SUITE_HOST_";

/**
 * Bewusst nicht `NodeJS.ProcessEnv`: Next augmentiert den Typ mit einem
 * verpflichtenden `NODE_ENV`, wodurch jedes Test-Fixture es mitschleppen müsste.
 * Gebraucht wird hier nur „String rein, String oder undefined raus".
 */
type EnvLike = Record<string, string | undefined>;

function envVarName(key: string): string {
  return PREFIX + key.toUpperCase().replace(/-/g, "_");
}

/**
 * Hosts aus der Env für ein Modul.
 * - Variable nicht gesetzt  → `null` (der Code-Default aus der Registry gilt)
 * - Variable leer gesetzt   → `[]` (bewusst **keine** Prod-Hosts; so lässt sich
 *   ein Cutover zurücknehmen, ohne die Variable zu entfernen)
 */
export function envHostsFor(key: string, env: EnvLike = process.env): string[] | null {
  const raw = env[envVarName(key)];
  if (raw === undefined) return null;
  return raw
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Prüft die Host-Konfiguration gegen die bekannten Module und liefert eine Liste
 * von Fehlermeldungen (leer = in Ordnung). Wird beim Boot aufgerufen.
 *
 * Was hier NICHT geprüft werden kann: ob die eingetragene Domain die *richtige*
 * ist. Ein korrekt geschriebenes `SUITE_HOST_QR=falsch.example.com` ist von hier
 * aus nicht von einem Tippfehler zu unterscheiden — der Host fällt dann in
 * `moduleForHost` auf das Portal zurück und die QR-Domain zeigt stillschweigend
 * das Portal. Deshalb gehört zu jedem Cutover ein curl gegen die neue Domain,
 * der prüft, dass dort auch wirklich *dieses* Modul antwortet.
 *
 * Dazu gehört ein zweiter, manueller Schritt: **einmal von der neuen Domain aus
 * anmelden und prüfen, dass man dort wieder landet.** Die Allowlist in
 * `core/auth/redirect.ts` erkennt einen Modul-Host über genau diese Variable —
 * fehlt sie, wirft Auth.js den Nutzer nach dem Login aufs Portal, ohne Fehler
 * und ohne Meldung. Ein curl sieht davon nichts.
 */
export function validateHostConfig(moduleKeys: string[], env: EnvLike = process.env): string[] {
  const errors: string[] = [];
  const known = new Map(moduleKeys.map((k) => [envVarName(k), k]));

  for (const name of Object.keys(env)) {
    if (!name.startsWith(PREFIX)) continue;
    if (!known.has(name)) {
      errors.push(
        `${name} passt zu keinem Modul. Bekannt: ${[...known.keys()].sort().join(", ")}`,
      );
    }
  }

  const claimedBy = new Map<string, string>();
  for (const key of moduleKeys) {
    for (const host of envHostsFor(key, env) ?? []) {
      if (host.includes("/") || host.includes(":")) {
        errors.push(
          `${envVarName(key)}: "${host}" muss ein reiner Hostname sein — ohne Protokoll und ohne Port.`,
        );
        continue;
      }
      const other = claimedBy.get(host);
      if (other && other !== key) {
        errors.push(
          `Host "${host}" ist doppelt vergeben: ${envVarName(other)} und ${envVarName(key)}.`,
        );
        continue;
      }
      claimedBy.set(host, key);
    }
  }

  return errors;
}
