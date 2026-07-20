import { describe, it, expect, vi, afterEach } from "vitest";
import { GET } from "./route";

const ISSUER = "https://id.iuk-ue.de";
const APP = "https://iuk-ue.de";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function stubDiscovery(body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ json: async () => body })),
  );
}

describe("GET /api/auth/oidc-signout", () => {
  // Der eigentliche Befund: diese Route fehlte in der Suite. providers.tsx
  // schickt bei RefreshTokenError hierher, und der Logout endete auf einer 404 —
  // die Sitzung beim Identity Provider lief dabei ungebrochen weiter.
  it("leitet auf den end_session_endpoint mit post_logout_redirect_uri", async () => {
    vi.stubEnv("AUTH_URL", APP);
    vi.stubEnv("POCKET_ID_ISSUER", ISSUER);
    stubDiscovery({ end_session_endpoint: `${ISSUER}/api/oidc/end-session` });

    const location = (await GET()).headers.get("location")!;
    const url = new URL(location);

    expect(url.origin + url.pathname).toBe(`${ISSUER}/api/oidc/end-session`);
    expect(url.searchParams.get("post_logout_redirect_uri")).toBe(`${APP}/login`);
  });

  // Ohne Issuer laeuft die Suite bewusst weiter (dev-login-only Umgebungen).
  // Der Nutzer ist an dieser Stelle abgemeldet — ihm eine Fehlerseite zu zeigen
  // hilft ihm nicht, der Weg zurueck ist der Login.
  it("ohne POCKET_ID_ISSUER direkt auf /login", async () => {
    vi.stubEnv("AUTH_URL", APP);
    vi.stubEnv("POCKET_ID_ISSUER", "");

    expect((await GET()).headers.get("location")).toBe(`${APP}/login`);
  });

  it("faellt auf /login zurueck, wenn die Discovery nicht antwortet", async () => {
    vi.stubEnv("AUTH_URL", APP);
    vi.stubEnv("POCKET_ID_ISSUER", ISSUER);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network");
      }),
    );

    expect((await GET()).headers.get("location")).toBe(`${APP}/login`);
  });

  // Ein Discovery-Dokument ohne end_session_endpoint laesst `new URL(undefined)`
  // werfen — das darf keine 500 werden, sondern denselben Ausgang nehmen.
  it("faellt auf /login zurueck, wenn die Discovery keinen end_session_endpoint hat", async () => {
    vi.stubEnv("AUTH_URL", APP);
    vi.stubEnv("POCKET_ID_ISSUER", ISSUER);
    stubDiscovery({});

    expect((await GET()).headers.get("location")).toBe(`${APP}/login`);
  });
});
