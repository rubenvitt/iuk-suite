import type { NextAuthConfig } from "next-auth";

type EnvLike = Record<string, string | undefined>;

/**
 * Cookie-Konfiguration für den Multi-Host-Betrieb der Suite.
 *
 * Das Problem, das das hier löst: Die Suite läuft auf mehreren Hosts
 * (`iuk-ue.de` als `AUTH_URL`, dazu Modul-Domains wie `qr.iuk-ue.de`). Startet
 * jemand den Login auf einer Modul-Domain, setzt Auth.js `state`,
 * `pkceCodeVerifier` und `nonce` **host-only** auf dieser Domain — der Callback
 * landet aber auf `AUTH_URL`. Dort fehlen die Cookies, und Auth.js bricht mit
 * `InvalidCheck: state value could not be parsed` ab; der Nutzer sieht
 * `/api/auth/error?error=Configuration`. Deshalb tragen alle diese Cookies
 * dieselbe Domain wie das Session-Cookie.
 *
 * **`callbackUrl` gehört aus demselben Grund dazu, mit einer anderen Folge.**
 * Der OIDC-Callback bringt keinen `callbackUrl`-Parameter mit; Auth.js liest das
 * Ziel dort aus genau diesem Cookie (`createCallbackUrl` in
 * `@auth/core/lib/utils/callback-url.js`). Host-only auf `qr.iuk-ue.de` gesetzt,
 * ist es auf `AUTH_URL` unsichtbar — Auth.js fällt still auf `url.origin` zurück
 * und der Nutzer landet nach dem Login auf dem Portal statt auf der Domain, von
 * der er kam. Kein Fehler, keine Meldung, nur die falsche Seite. Die Domain hier
 * ist nötig, aber allein nicht hinreichend: siehe `redirect.ts` (Allowlist) und
 * `login-form.tsx` (absolutes Ziel beim Absenden).
 *
 * **`csrfToken` bleibt bewusst außen vor.** Auth.js verwendet dafür in
 * Produktion den `__Host-`-Präfix, und der verbietet ein `domain`-Attribut — der
 * Browser würde das Cookie verwerfen und der Login bräche an anderer Stelle,
 * nur genauso zuverlässig. `state`/`pkce`/`nonce` tragen `__Secure-`, das
 * `domain` erlaubt.
 *
 * **Warum hier nur `domain` und `secure` stehen:** Auth.js merged die Config
 * tief in seine Defaults (`merge(defaultCookies(...), config.cookies)` in
 * `@auth/core/lib/init.js`, und `merge` überschreibt nur bei `!== undefined`).
 * `httpOnly`, `path`, `sameSite` und `maxAge` bleiben damit erhalten, ohne dass
 * wir sie duplizieren müssten — nachgemessen am Set-Cookie-Header eines echten
 * Logins: `Path=/; Expires=…; HttpOnly; SameSite=Lax`, obwohl die Config nichts
 * davon setzt. Sie hier zu wiederholen hieße, von Auth.js gepflegte Werte
 * einzufrieren (etwa die 900 s für `state`/`nonce`/`pkce`).
 *
 * `secure` steht dennoch explizit drin, weil es vom Default abweicht: Auth.js
 * leitet es aus dem Protokoll der `AUTH_URL` ab, das Projekt aus `NODE_ENV`.
 * Das ist bestehendes Verhalten und wird hier nicht nebenbei geändert.
 */
export function authCookies(env: EnvLike = process.env): NonNullable<NextAuthConfig["cookies"]> {
  const domain = env.AUTH_COOKIE_DOMAIN || undefined;
  const options = {
    domain,
    secure: env.NODE_ENV === "production",
  };

  return {
    sessionToken: { options },
    state: { options },
    pkceCodeVerifier: { options },
    nonce: { options },
    callbackUrl: { options },
  };
}
