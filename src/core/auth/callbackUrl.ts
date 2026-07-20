/**
 * Macht ein Login-Ziel absolut — gegen den Host, auf dem der Login *beginnt*.
 *
 * Warum das nötig ist: Auth.js löst ein relatives `redirectTo` gegen `AUTH_URL`
 * auf, nicht gegen den anfragenden Host (`createActionURL` in
 * `@auth/core/lib/utils/env.js` bevorzugt `envUrl` und sieht den Host-Header gar
 * nicht erst an). Ein Login, der auf `qr.iuk-ue.de` beginnt, endete damit auf
 * dem Portal. Der Browser-Origin ist die letzte Stelle im Ablauf, an der die
 * Modul-Domain überhaupt noch bekannt ist — ab dem OIDC-Callback ist sie weg.
 *
 * Bewusst **ohne** Allowlist-Prüfung: die gehört in `redirect.ts` und läuft
 * serverseitig. Sie hier zu wiederholen, täuschte einen Schutz vor, den eine
 * Client-Komponente nicht leisten kann.
 */
export function absoluteCallbackUrl(callbackUrl: string, origin: string): string {
  try {
    return new URL(callbackUrl, origin).toString();
  } catch {
    return new URL("/", origin).toString();
  }
}
