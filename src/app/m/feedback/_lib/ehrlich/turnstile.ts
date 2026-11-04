/**
 * CLOUDFLARE TURNSTILE FÜR DEN EINWURF (IDA-340). Aktiv, sobald Site-Key UND Secret gesetzt sind; dann
 * verlangt jeder Einwurf ein gültiges Token. Ohne beide Werte läuft der Einwurf wie bisher (lokal, e2e).
 *
 * Zur Zusage „keine IP": an Cloudflare geht nur das Token, kein `remoteip` — Cloudflare sieht die Adresse
 * als Vorschaltung ohnehin, wir reichen sie nicht weiter und speichern sie nicht.
 *
 * Kein `"use client"`: Server Components und Server Actions lesen hier (Falle 6, `CLAUDE.md`).
 */

type EnvLike = Record<string, string | undefined>;

export const TURNSTILE_SITE_KEY_ENV = "SUITE_EHRLICH_TURNSTILE_SITE_KEY";
export const TURNSTILE_SECRET_ENV = "SUITE_EHRLICH_TURNSTILE_SECRET";
const PRUEF_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const ZEITLIMIT_MS = 5_000;

function wert(env: EnvLike, name: string): string | null {
  const roh = env[name]?.trim();
  return roh ? roh : null;
}

/** Der öffentliche Site-Key, wenn Turnstile aktiv ist — sonst null (dann zeigt der Einwurf kein Widget). */
export function turnstileSiteKey(env: EnvLike = process.env): string | null {
  return wert(env, TURNSTILE_SECRET_ENV) ? wert(env, TURNSTILE_SITE_KEY_ENV) : null;
}

/**
 * Prüft das Token bei Cloudflare. Ohne Konfiguration true; mit Konfiguration nur bei `success: true`.
 * Netzfehler, Zeitüberschreitung und fremde Antworten zählen als nicht bestanden.
 */
export async function pruefeTurnstile(token: string, env: EnvLike = process.env, holen: typeof fetch = fetch): Promise<boolean> {
  const secret = wert(env, TURNSTILE_SECRET_ENV);
  if (!secret || !wert(env, TURNSTILE_SITE_KEY_ENV)) return true;
  if (token === "") return false;
  try {
    const antwort = await holen(PRUEF_URL, {
      method: "POST",
      body: new URLSearchParams({ secret, response: token }),
      redirect: "error",
      signal: AbortSignal.timeout(ZEITLIMIT_MS),
    });
    if (!antwort.ok) return false;
    const daten = (await antwort.json()) as { success?: unknown };
    return daten.success === true;
  } catch {
    return false;
  }
}
