import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import type { JWT } from "next-auth/jwt";
import { parseGroups, parseDevGroups } from "@/core/auth/groups";
import { devLoginEnabled } from "@/core/auth/devLogin";
import { pocketIdProvider } from "@/core/auth/pocketId";

import { suiteAdminGroup } from "@/core/groups";

async function getOIDCConfig() {
  const issuer = process.env.POCKET_ID_ISSUER!;
  const res = await fetch(`${issuer}/.well-known/openid-configuration`);
  return res.json() as Promise<{ token_endpoint: string; end_session_endpoint: string }>;
}

async function refreshAccessToken(token: JWT): Promise<JWT> {
  if (!token.refreshToken) {
    return { ...token, error: "RefreshTokenError" };
  }

  try {
    const { token_endpoint } = await getOIDCConfig();

    const res = await fetch(token_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: token.refreshToken as string,
        client_id: process.env.POCKET_ID_CLIENT_ID!,
        client_secret: process.env.POCKET_ID_CLIENT_SECRET!,
      }),
    });

    if (!res.ok) throw new Error("Token refresh failed");

    const refreshed = await res.json();
    return {
      ...token,
      accessToken: refreshed.access_token,
      idToken: refreshed.id_token ?? token.idToken,
      refreshToken: refreshed.refresh_token ?? token.refreshToken,
      expiresAt:
        refreshed.expires_at ??
        Math.floor(Date.now() / 1000 + refreshed.expires_in),
      error: undefined,
    };
  } catch {
    return { ...token, error: "RefreshTokenError" };
  }
}

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

export const { auth, handlers, signIn, signOut } = NextAuth({
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
  cookies: {
    sessionToken: {
      options: {
        domain: process.env.AUTH_COOKIE_DOMAIN || undefined,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
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
      }
      if (user?.groups) {
        token.groups = user.groups;
      }

      // Refresh expired access token
      if (token.expiresAt && Date.now() / 1000 > (token.expiresAt as number)) {
        return refreshAccessToken(token);
      }

      return token;
    },
    session({ session, token }) {
      const groups = (token.groups as string[]) ?? [];
      session.user.groups = groups;
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
    authorized({ auth: session }) {
      return !!session?.user;
    },
  },
  trustHost: true,
});
