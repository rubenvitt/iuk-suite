import { getModule, prodHostsFor } from "@/core/registry";

type EnvLike = Record<string, string | undefined>;

/**
 * Der Magic-Link, den die Verwaltung einem Teilnehmer weitergibt (Aufgabe 16).
 *
 * DER HOST KOMMT AUSSCHLIESSLICH AUS `prodHostsFor(getModule("uav"), env)` —
 * also aus `SUITE_HOST_UAV`, wenn gesetzt, sonst der leeren Registry-Vorgabe.
 * NIE `AUTH_URL` (das ist Pocket IDs Adresse, nicht die der Suite) und NIE
 * `headers().host` (Lehre aus dem feedback-QR-Befund: ein Host aus dem
 * eingehenden Request kann jeder beliebige sein, den der Proxy durchlässt).
 *
 * OHNE Prod-Host (lokale Entwicklung) fällt die Funktion auf dasselbe
 * wildcard-DNS-Schema wie `core/shell/moduleUrl.ts` zurück — `env.PORT`/
 * `env.SUITE_DEV_HOST_SUFFIX`, mit denselben Vorgaben `3000`/`localtest.me`.
 */
export function magicLink(code: string, env: EnvLike = process.env): string {
  const host = prodHostsFor(getModule("uav"), env)[0];
  if (host) return `https://${host}/login?code=${encodeURIComponent(code)}`;

  const port = env.PORT ?? "3000";
  const suffix = env.SUITE_DEV_HOST_SUFFIX ?? "localtest.me";
  return `http://uav.${suffix}:${port}/login?code=${encodeURIComponent(code)}`;
}
