import Credentials from "next-auth/providers/credentials";
import type { NextAuthConfig } from "next-auth";
import type { NextRequest } from "next/server";

import { parseGroups, parseDevGroups } from "@/core/auth/groups";
import { parseFachgruppen } from "@/core/auth/fachgruppen";
import { devLoginEnabled } from "@/core/auth/devLogin";
import { pocketIdProvider } from "@/core/auth/pocketId";
import { authCookies } from "@/core/auth/cookies";
import { suiteRedirect } from "@/core/auth/redirect";
import { suiteAdminGroup } from "@/core/groups";
import { tokenAuffrischen } from "@/core/auth/refresh";

/**
 * Die NextAuth-Konfiguration — als FUNKTION ueber die Anfrage, nicht als Objekt.
 *
 * Der Grund ist keine Kosmetik. next-auth ruft diese Funktion je nach Weg mit
 * oder ohne Anfrage (`node_modules/next-auth/index.js:101-125`):
 *
 *   `handlers` GET/POST /api/auth/*      -> config(req)        Set-Cookie kommt an
 *   `auth()` in RSC / Server Action      -> config(undefined)  Set-Cookie wird VERWORFEN
 *   `auth()` in Middleware / API Route   -> config(req)        Set-Cookie kommt an
 *
 * Der RSC-Zweig liest ausschliesslich `r.json()` (lib/index.js:91) und wirft
 * die Cookie-Header weg. `request === undefined` ist damit der einzige
 * verlaessliche Hinweis darauf, dass sich ein Token-Refresh hier nicht nur
 * nicht lohnt, sondern SCHADET: Pocket ID rotiert das Refresh-Token, das neue
 * ginge verloren, und der naechste Versuch waere eine Wiederverwendung, die
 * die ganze Sitzung widerruft. Siehe `refresh.ts`.
 */
export function authConfig(request: NextRequest | undefined): NextAuthConfig {
  const providers = [
    ...(devLoginEnabled()
      ? [
          Credentials({
            id: "dev-login",
            name: "Dev Login",
            credentials: { email: {}, groups: {} },
            authorize(credentials) {
              const email = String(credentials?.email ?? "dev@localtest.me");
              return {
                id: `dev:${email}`,
                name: "Dev User",
                email,
                groups: parseDevGroups(credentials?.groups),
              };
            },
          }),
        ]
      : []),
    // Register the Pocket ID OIDC provider only when it is actually configured.
    // Auth.js validates EVERY configured provider on EVERY /api/auth/* request, so an
    // issuer-less oidc provider makes assertConfig throw (500) for the whole route —
    // breaking dev-login-only environments where no Pocket ID env vars are set.
    // Production sets POCKET_ID_ISSUER, so real SSO still registers there.
    ...(process.env.POCKET_ID_ISSUER ? [pocketIdProvider()] : []),
  ];

  return {
    providers,
    // Auth.js always needs a secret to encrypt the session JWT. Use AUTH_SECRET when
    // set; otherwise fall back to a fixed insecure secret ONLY while dev-login is active
    // (dev mode) so a bare `pnpm dev` works out of the box. In production dev-login is
    // off, so this stays undefined and Auth.js fails loudly if AUTH_SECRET is missing.
    secret:
      process.env.AUTH_SECRET ??
      (devLoginEnabled() ? "dev-only-insecure-secret-not-for-production" : undefined),
    session: {
      strategy: "jwt",
    },
    pages: {
      signIn: "/login",
    },
    // Nicht nur das Session-Cookie: state/pkce/nonce/callbackUrl brauchen dieselbe
    // Domain, sonst scheitert jeder Login, der auf einer Modul-Domain beginnt —
    // die ersten drei laut, callbackUrl still auf der falschen Seite. Warum
    // csrfToken aussen vor bleibt, steht in cookies.ts.
    cookies: authCookies(),
    callbacks: {
      async jwt({ token, profile, user, account }) {
        // On initial sign-in, store OAuth tokens
        if (account) {
          token.accessToken = account.access_token;
          token.idToken = account.id_token;
          token.refreshToken = account.refresh_token;
          token.expiresAt = account.expires_at;
        }

        // Extract groups from the OIDC profile
        if (profile) {
          token.groups = parseGroups(profile as Record<string, unknown>);
          // Fachgruppen-Attribut: derselbe Weg, dieselbe Vertrauensbasis wie
          // `groups` (signiertes ID-Token). Es benennt die Fachgruppen-Slugs, für
          // die die Person Gruppenleitung ist; aufgelöst wird es erst im Modul.
          token.fachgruppen = parseFachgruppen(profile as Record<string, unknown>);
        }
        if (user?.groups) {
          token.groups = user.groups;
        }

        // Ob ueberhaupt aufgefrischt werden muss — und ob es sich lohnt —
        // entscheidet refresh.ts. `darfSchreiben` ist der Kern: nur wenn das
        // Ergebnis dieses Aufrufs beim Browser ankommen kann, darf das
        // Refresh-Token bei Pocket ID rotiert werden. Siehe Kopfkommentar.
        return tokenAuffrischen(token, { darfSchreiben: request !== undefined });
      },
      session({ session, token }) {
        const groups = (token.groups as string[]) ?? [];
        session.user.groups = groups;
        session.user.fachgruppen = (token.fachgruppen as string[]) ?? [];
        // Suite-weit, nicht modul-bezogen: "ist Betreiber". Für die Frage
        // "darf dieser Nutzer Modul X administrieren?" gibt es isModuleAdmin
        // aus core/groups — session.user.isAdmin beantwortet sie NICHT.
        session.user.isAdmin = groups.includes(suiteAdminGroup());
        if (token.sub) {
          session.user.id = token.sub;
        }
        if (token.error) {
          session.error = token.error as string;
        }
        return session;
      },
      // Laeuft heute NIE: `authorized` ruft next-auth nur im Middleware-/
      // Route-Wrapper-Zweig (lib/index.js:133), und `src/middleware.ts` gibt es
      // in diesem Projekt nicht. Bleibt als Vorgabe fuer den Tag stehen, an dem
      // eine Middleware dazukommt — die muesste dann einen `matcher` tragen,
      // sonst sperrt sie die login-freien Ansichten von `feedback` aus.
      authorized({ auth: session }) {
        return !!session?.user;
      },
      // Ohne diesen Callback wirft Auth.js jedes Ziel ausserhalb von AUTH_URL aufs
      // Portal zurück — und AUTH_URL ist auf jedem Modul-Host derselbe Wert. Warum
      // eine Allowlist und keine Blanko-Erlaubnis: siehe redirect.ts.
      redirect({ url, baseUrl }) {
        return suiteRedirect({ url, baseUrl });
      },
    },
    trustHost: true,
  };
}
