/**
 * CLOUDFLARE TURNSTILE FÜR DIE OFFENEN FORMULARE (IDA-340, IDA-341): Einwurf in „Ehrlich gesagt", Bar-Anfrage,
 * Mangel am Gerät ohne Anmeldung. Aktiv, sobald Site-Key UND Secret gesetzt sind; dann verlangt jedes dieser
 * Formulare ein gültiges Token. Ohne beide Werte laufen sie wie bisher (lokal, e2e).
 *
 * Zur Zusage „keine IP": an Cloudflare geht nur das Token, kein `remoteip` — Cloudflare sieht die Adresse
 * als Vorschaltung ohnehin, wir reichen sie nicht weiter und speichern sie nicht.
 *
 * Kein `"use client"`: Server Components und Server Actions lesen hier (Falle 6, `CLAUDE.md`).
 */

import type { TurnstileAktion } from "./aktionen";

type EnvLike = Record<string, string | undefined>;

// Namen wie in Cloudflares Vorgabe; der Site-Key wird zur Laufzeit gelesen, nie als `NEXT_PUBLIC_…` eingebacken.
export const TURNSTILE_SITE_KEY_ENV = "TURNSTILE_SITE_KEY";
export const TURNSTILE_SECRET_ENV = "TURNSTILE_SECRET";
/** Optional: Kommaliste der Hosts, auf denen das Widget gelöst sein darf (`hostname` der Antwort). */
export const TURNSTILE_HOSTNAMES_ENV = "TURNSTILE_HOSTNAMES";
const TOKEN_MAX = 2048;
const PRUEF_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const ZEITLIMIT_MS = 5_000;

function wert(env: EnvLike, name: string): string | null {
  const roh = env[name]?.trim();
  return roh ? roh : null;
}

/** Der öffentliche Site-Key, wenn Turnstile aktiv ist — sonst null (dann zeigt das Formular kein Widget). */
export function turnstileSiteKey(env: EnvLike = process.env): string | null {
  return wert(env, TURNSTILE_SECRET_ENV) ? wert(env, TURNSTILE_SITE_KEY_ENV) : null;
}

/** Boot-Prüfung (`assertHostConfig`): Site-Key und Secret nur zusammen, sonst liefen die Formulare still ohne Prüfung. */
export function turnstileKonfigFehler(env: EnvLike = process.env): string[] {
  const key = wert(env, TURNSTILE_SITE_KEY_ENV);
  const secret = wert(env, TURNSTILE_SECRET_ENV);
  return !key !== !secret ? [`${TURNSTILE_SITE_KEY_ENV} und ${TURNSTILE_SECRET_ENV} müssen zusammen gesetzt sein.`] : [];
}

/**
 * Prüft das Token bei Cloudflare. Ohne Konfiguration true; mit Konfiguration nur bei `success: true`, der Aktion
 * des prüfenden Formulars (`aktion`) und, wenn `TURNSTILE_HOSTNAMES` gesetzt ist, einem erlaubten `hostname`. Netzfehler,
 * Zeitüberschreitung und fremde Antworten zählen als nicht bestanden. Ein Token gilt bei Cloudflare nur einmal.
 */
export async function pruefeTurnstile(
  token: string, aktion: TurnstileAktion, env: EnvLike = process.env, holen: typeof fetch = fetch,
): Promise<boolean> {
  const secret = wert(env, TURNSTILE_SECRET_ENV);
  if (!secret || !wert(env, TURNSTILE_SITE_KEY_ENV)) return true;
  if (token === "" || token.length > TOKEN_MAX) return false;
  const hosts = (wert(env, TURNSTILE_HOSTNAMES_ENV) ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  try {
    const antwort = await holen(PRUEF_URL, {
      method: "POST",
      body: new URLSearchParams({ secret, response: token }),
      redirect: "error",
      signal: AbortSignal.timeout(ZEITLIMIT_MS),
    });
    if (!antwort.ok) return false;
    const daten = (await antwort.json()) as { success?: unknown; action?: unknown; hostname?: unknown };
    if (daten.success !== true || daten.action !== aktion) return false;
    return hosts.length === 0 || (typeof daten.hostname === "string" && hosts.includes(daten.hostname.toLowerCase()));
  } catch {
    return false;
  }
}
