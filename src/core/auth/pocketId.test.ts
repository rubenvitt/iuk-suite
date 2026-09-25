import { describe, it, expect } from "vitest";
import { pocketIdProvider, POCKET_ID_PROVIDER_ID } from "@/core/auth/pocketId";

describe("pocketIdProvider", () => {
  // Regression guard: next-auth v5 defaults to PKCE-only and omits `state`, but
  // Pocket ID rejects an authorize request without a `state` (>=8 chars) param
  // (`invalid_state`, later surfacing as the misleading "iss missing"). `pkce`
  // must stay for the PKCE requirement.
  it("enables at least the state and pkce checks", () => {
    const { checks } = pocketIdProvider();
    expect(Array.isArray(checks)).toBe(true);
    expect(checks).toContain("state");
    expect(checks).toContain("pkce");
  });
});

describe("POCKET_ID_PROVIDER_ID", () => {
  /**
   * Die Kennung steht woertlich auch dort, wo `POCKET_ID_PROVIDER_ID` nicht
   * importiert wird: `signIn("pocket-id", …)` im Login-Formular und
   * `?provider=pocket-id` in der Proxy-URL. Auth.js meldet einen unbekannten
   * Anbieter erst zur Laufzeit — `pnpm build` bliebe gruen.
   */
  it("nennt genau die Kennung, unter der der Provider registriert ist", () => {
    expect(POCKET_ID_PROVIDER_ID).toBe("pocket-id");
    expect(pocketIdProvider().id).toBe(POCKET_ID_PROVIDER_ID);
  });
});
