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

/**
 * 30 Tage. Entspricht dem heutigen Auth.js-Default (init.js:38) und ist fuer
 * ein internes Werkzeug mit SSO reichlich. Vertretbar ist die Laenge nur,
 * WEIL die Gruppen im Token bei jedem erfolgreichen Refresh frisch aus dem
 * `id_token` gezogen werden (`refresh.ts`) — sonst behielte jemand entzogene
 * Rechte einen Monat lang.
 */
export const SITZUNGSDAUER_S = 30 * 24 * 60 * 60;

/**
 * Ebenfalls der Auth.js-Default. ACHTUNG: unter `strategy: "jwt"` liest Auth.js
 * diesen Wert NICHT — er wird nur im Datenbank-Zweig ausgewertet
 * (actions/session.js:77-92). Rollierend ist die Sitzung trotzdem, weil der
 * JWT-Zweig `expires` bei jedem Aufruf neu setzt und `SessionProvider` bei
 * jedem Mount `/api/auth/session` ruft. Der Wert steht als Absicht hier und
 * traegt, falls je auf Datenbank-Sessions umgestellt wird.
 */
export const SITZUNGS_AUFFRISCHUNG_S = 24 * 60 * 60;

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
      maxAge: SITZUNGSDAUER_S,
      updateAge: SITZUNGS_AUFFRISCHUNG_S,
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
          /*
           * DER SCHLUESSEL DER SUITE — die Zeile, ohne die keine Zuordnung hält.
           *
           * Auth.js setzt `user.id` NICHT aus dem Profil, sondern auf eine
           * Zufalls-UUID (@auth/core 0.41.0,
           * `lib/actions/callback/oauth/callback.js:219-226`, ausdrücklich:
           * „the user should remain independent of the provider"), und baut
           * daraus `token.sub` (`callback/index.js:76`). Was `pocketId.ts` in
           * `profile()` als `id` zurückgibt, ist zu diesem Zeitpunkt längst
           * überschrieben.
           *
           * Damit war der `sub` PRO ANMELDUNG EIN ANDERER. Gemessen am
           * 2026-07-28 in der Produktion: 13 Zeilen in `known_users` für EINE
           * Person, in drei Tagen entstanden, teils Sekunden auseinander. Die
           * Zuordnung einer Gruppenleitung über `user_groups` konnte deshalb
           * prinzipiell nie greifen — die Kennung der nächsten Sitzung passte
           * nicht mehr, egal welchen Eintrag ein Admin auswählte. Sichtbar war
           * das als „Dir ist noch keine Gruppe zugeordnet" trotz gesetzter
           * Zuordnung, und als dieselbe Person mehrfach in der Auswahlliste.
           *
           * `profile` liegt NUR bei der Anmeldung an. Der `sub` wird also genau
           * einmal gesetzt und von jedem späteren Aufruf unverändert
           * weitergetragen — `tokenAuffrischen` fasst ihn nicht an. Der
           * Dev-Login (Credentials) hat gar kein `profile`; dort bleibt
           * `token.sub` bei `dev:<email>`, wie gehabt.
           *
           * WAS DIESE ZEILE NICHT HEILT: laufende Sitzungen tragen ihre alte
           * UUID bis zum nächsten Login weiter (30 Tage Sitzungsdauer). Wer die
           * Wirkung sofort will, erzwingt eine Neuanmeldung.
           */
          const sub = (profile as Record<string, unknown>).sub;
          if (typeof sub === "string" && sub !== "") {
            token.sub = sub;
          }
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
      // ACHTUNG, DAS LAEUFT: next-auth ruft `authorized` im Wrapper-Zweig
      // (lib/index.js:133) — und den nutzt `src/proxy.ts` bei JEDER Anfrage.
      // (Next.js 16 hat `middleware.ts` in `proxy.ts` umbenannt; wer nach
      // `src/middleware.ts` sucht, findet nichts und schliesst falsch, es gebe
      // keine Middleware. Genau daran ist schon einmal die ganze Anwendung
      // gescheitert.)
      //
      // Der Rueckgabewert wird hier trotzdem verworfen: sobald eine eigene
      // Weiche uebergeben ist, gewinnt deren Antwort (lib/index.js:148), und
      // der `!authorized`-Zweig (:156) kommt nie dran. Wer das aendern will,
      // muss wissen: dieser Callback kennt den `matcher` nicht und wuerde die
      // login-freien Ansichten von `feedback` aussperren. Die Zugangsfrage
      // beantwortet `decideRoute`, nicht diese Zeile.
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
