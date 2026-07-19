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
