import { describe, it, expect } from "vitest";
import { pocketIdProvider } from "@/core/auth/pocketId";

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
