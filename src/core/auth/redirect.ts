import { moduleForHost } from "@/core/registry";

type EnvLike = Record<string, string | undefined>;

/**
 * Der `redirect`-Callback für den Multi-Host-Betrieb der Suite.
 *
 * Das Problem: Auth.js leitet seine `baseUrl` aus `AUTH_URL` ab — **immer**,
 * auch bei `trustHost: true` (`createActionURL` in `@auth/core/lib/utils/env.js`
 * bevorzugt `envUrl` und sieht den Host-Header gar nicht erst an). Die baseUrl
 * ist damit auf jedem Modul-Host `https://iuk-ue.de`. Der Default-Callback
 *
 *     if (url.startsWith("/")) return `${baseUrl}${url}`
 *     if (new URL(url).origin === baseUrl) return url
 *     return baseUrl
 *
 * wirft folglich jedes Ziel auf einer Modul-Domain aufs Portal zurück: wer sich
 * von `qr.iuk-ue.de` anmeldet, landet nach dem Login auf `iuk-ue.de`.
 *
 * Blanko erlauben lässt sich das nicht — Auth.js hängt den Wert ungeprüft an,
 * ein präparierter `callbackUrl` wäre sonst ein offener Redirector. Deshalb eine
 * Allowlist: erlaubt ist, was `moduleForHost` als Suite-Host kennt (also die
 * Prod-Hosts aus `SUITE_HOST_<KEY>` bzw. der Registry, dazu `<key>.localtest.me`
 * in Dev) — plus die baseUrl selbst, damit ein leer gesetztes
 * `SUITE_HOST_PORTAL` nicht den Login des Portals mitnimmt.
 *
 * Das Protokoll muss dem der baseUrl entsprechen: ein Downgrade auf http nähme
 * die `secure`-Cookies nicht mit und wäre in Prod immer ein Konfigurationsfehler.
 */
export function suiteRedirect(input: {
  url: string;
  baseUrl: string;
  env?: EnvLike;
}): string {
  const { url, baseUrl, env = process.env } = input;

  // Relative Ziele: bestehendes Auth.js-Verhalten, unverändert. Ausgenommen
  // `//host/x` — protokoll-relativ, vom Browser als fremde Origin gelesen. Der
  // Default-Callback zählt es über `startsWith("/")` zu den relativen Zielen;
  // hier läuft es weiter unten durch dieselbe Allowlist wie jede andere Origin.
  if (url.startsWith("/") && !url.startsWith("//")) return `${baseUrl}${url}`;

  let target: URL;
  let base: URL;
  try {
    target = new URL(url);
    base = new URL(baseUrl);
  } catch {
    return baseUrl;
  }

  if (target.protocol !== base.protocol) return baseUrl;
  if (target.host === base.host) return url;
  if (moduleForHost(target.hostname, env)) return url;

  return baseUrl;
}
