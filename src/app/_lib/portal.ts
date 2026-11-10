import { moduleUrl } from "@/core/shell/moduleUrl";

type EnvLike = Record<string, string | undefined>;

/**
 * Das Portal auf dem Suite-Host. `AUTH_URL` ist suiteweit derselbe Wert und zeigt auf die Suite (nicht auf
 * Pocket ID). Fehlt er (lokal, e2e), gilt die Moduladresse des Portals (`moduleUrl`, dort
 * `portal.localtest.me`) — ein relatives `/` wäre auf einem Modul-Host wieder das Modul. Je Anfrage
 * gelesen, nie auf Modulebene, sonst bäckt `next build` ihn ein (vgl. Falle 21).
 */
export function portalUrl(env: EnvLike = process.env): string {
  const basis = env.AUTH_URL?.trim();
  if (basis) {
    try {
      return new URL("/", basis).toString();
    } catch {
      // fällt auf die Moduladresse zurück
    }
  }
  const modul = moduleUrl("portal");
  return modul ? `${modul}/` : "/";
}
