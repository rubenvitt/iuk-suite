import { cookiesSicher } from "@/core/lokalHttp";

/**
 * Das Cookie, das den Browser an einen angefangenen Verbindungsvorgang bindet (OAuth-`state`).
 * `SameSite=Lax`: die Rückkehr von HiOrg ist eine Navigation auf oberster Ebene und muss es
 * mitbringen. Pfad `/hiorg`, zehn Minuten — wie der Vorgang in der Datenbank.
 */
export const VORGANGS_COOKIE = "helfer_hiorg_vorgang";

export function vorgangsCookie(state: string): string {
  return `${VORGANGS_COOKIE}=${state}; Path=/hiorg; Max-Age=600; HttpOnly; SameSite=Lax${cookiesSicher() ? "; Secure" : ""}`;
}

export function vorgangsCookieLoeschen(): string {
  return `${VORGANGS_COOKIE}=; Path=/hiorg; Max-Age=0; HttpOnly; SameSite=Lax${cookiesSicher() ? "; Secure" : ""}`;
}

export function vorgangAusCookie(kopf: string | null): string | null {
  for (const teil of (kopf ?? "").split(";")) {
    const [name, ...wert] = teil.trim().split("=");
    if (name === VORGANGS_COOKIE) return wert.join("=") || null;
  }
  return null;
}

/** Relative Weiterleitung: der Browser löst sie gegen den Modul-Host auf, nicht gegen den internen Pfad. */
export function weiter(ziel: string, cookie?: string): Response {
  const headers = new Headers({ location: ziel, "cache-control": "no-store" });
  if (cookie) headers.append("set-cookie", cookie);
  return new Response(null, { status: 303, headers });
}
