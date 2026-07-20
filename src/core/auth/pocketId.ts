import { parseGroups } from "@/core/auth/groups";

const SCOPES = process.env.POCKET_ID_SCOPES ?? "openid profile email groups";

// Pocket ID requires a `state` param (>=8 chars); next-auth v5 defaults to
// PKCE-only and omits state+nonce -> Pocket ID rejects with `invalid_state`
// (surfaced later as the misleading "iss missing"). PKCE stays enabled
// (code_challenge is still sent); `nonce` is an OIDC bonus.
const CHECKS: Array<"pkce" | "state" | "nonce"> = ["pkce", "state", "nonce"];

export function pocketIdProvider() {
  return {
    id: "pocket-id",
    name: "Pocket ID",
    type: "oidc" as const,
    issuer: process.env.POCKET_ID_ISSUER,
    clientId: process.env.POCKET_ID_CLIENT_ID,
    clientSecret: process.env.POCKET_ID_CLIENT_SECRET,
    checks: CHECKS,
    // Redirect-Proxy auf dem Portal-Host: Pocket ID kennt nur eine Redirect-URI
    // (AUTH_URL), aber Auth.js baut die Callback-URL pro Request aus dem
    // jeweiligen Host. Beginnt der Login auf qr.iuk-ue.de, praesentiert die
    // Authorization-Request dort eine Callback-URL auf qr.iuk-ue.de — das wirft
    // Pocket IDs Redirect-URI-Check. Der Proxy ist die Antwort von Auth.js:
    // der IdP redet immer mit AUTH_URL; der Proxy lenkt danach auf den Host
    // um, auf dem der Login begann (state traegt die verschlüsselte Origin —
    // `shouldRedirect` in @auth/core/lib/actions/callback/index.ts).
    //
    // Das ist zugleich der Fix fuer "lande nach dem Login auf dem Portal statt
    // auf der Modul-Domain": beim Proxy-Durchlauf bleibt die callbackUrl als
    // URL-Parameter erhalten (unabhaengig von Cookies, die Cross-Site je nach
    // Browser unterwegs verloren gehen), und der Session-Cookie wird erst auf
    // dem Ziel-Host gesetzt — derselbe Browser-Tab, keine Cookie-Domain- oder
    // SameSite-Falle mehr.
    //
    // `?provider=pocket-id` weil Auth.js die Proxy-Route sonst nicht dem
    // Provider zuordnet und das Session-Cookie sonst auf dem Proxy-Host (immer
    // das Portal) setzt statt auf dem Host, von dem der Nutzer kam.
    ...(process.env.AUTH_URL
      ? { redirectProxyUrl: `${process.env.AUTH_URL}/api/auth/callback?provider=pocket-id` }
      : {}),
    authorization: {
      params: {
        scope: SCOPES,
      },
    },
    profile(profile: Record<string, unknown>) {
      return {
        id: profile.sub as string,
        name: (profile.name ?? profile.preferred_username) as string | undefined,
        email: profile.email as string | undefined,
        image: profile.picture as string | undefined,
        groups: parseGroups(profile),
      };
    },
  };
}
