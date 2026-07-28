import { describe, it, expect } from "vitest";
import { pocketIdProvider, reauthProviderId, POCKET_ID_PROVIDER_ID } from "@/core/auth/pocketId";

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

describe("reauthProviderId", () => {
  /**
   * Der SessionGuard darf `signIn("pocket-id")` nur rufen, wenn es diesen
   * Provider auch gibt. Sonst faende `signIn` ihn nicht in der Providerliste
   * und navigierte hart auf die Login-Seite (`next-auth/react.js:131-142`,
   * dort steht sogar ein TODO dazu) — ein Rauswurf mit anderem Anstrich.
   * Serverseitig gibt es keinen Weg, die Providerliste abzufragen:
   * `getProviders` ist eine Client-Funktion, und NextAuth() gibt seine Config
   * nicht heraus (`next-auth/index.js:131-144`).
   */
  it("nennt den Provider, wenn Pocket ID konfiguriert ist", () => {
    expect(reauthProviderId({ POCKET_ID_ISSUER: "https://id.example.test" })).toBe(
      POCKET_ID_PROVIDER_ID,
    );
  });

  it("liefert null ohne Issuer — dort gibt es nur den Dev-Login", () => {
    expect(reauthProviderId({})).toBeNull();
    expect(reauthProviderId({ POCKET_ID_ISSUER: "" })).toBeNull();
  });

  it("nennt genau die Kennung, unter der der Provider registriert ist", () => {
    expect(pocketIdProvider().id).toBe(POCKET_ID_PROVIDER_ID);
  });
});
