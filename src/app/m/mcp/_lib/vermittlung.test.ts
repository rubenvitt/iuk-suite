import { beforeEach, describe, expect, it } from "vitest";
import {
  anmeldungStarten, anmeldungZurueck, autorisierungsserver, registriere, rueckwegErlaubt, tokenAnfrage,
  vergissAnmeldungen, type Umfeld,
} from "./vermittlung";

const U: Umfeld = {
  herkunft: "https://mcp.example.test",
  clientId: "suite-mcp",
  pocket: {
    issuer: "https://id.example.test",
    authorization_endpoint: "https://id.example.test/authorize",
    token_endpoint: "https://id.example.test/api/oidc/token",
    jwks_uri: "https://id.example.test/.well-known/jwks.json",
    userinfo_endpoint: "https://id.example.test/api/oidc/userinfo",
  },
  jetzt: 1_000_000,
};

const CHATGPT = "https://chatgpt.com/connector_platform_oauth_redirect";

function ort(w: ReturnType<typeof anmeldungStarten>): URL {
  if (w.art !== "umleiten") throw new Error(`keine Umleitung: ${w.text}`);
  return new URL(w.ziel);
}

function starte(rueckweg = CHATGPT, extra: Record<string, string> = {}) {
  return anmeldungStarten(new URLSearchParams({
    client_id: "suite-mcp", redirect_uri: rueckweg, response_type: "code", state: "client-state",
    code_challenge: "abc", code_challenge_method: "S256", resource: "https://mcp.example.test/mcp", ...extra,
  }), U);
}

beforeEach(() => vergissAnmeldungen());

describe("Vermittlung an Pocket ID", () => {
  it("nennt sich als Autorisierungsserver mit Registrierung, ohne CIMD", () => {
    const m = autorisierungsserver(U.herkunft);
    expect(m.issuer).toBe(U.herkunft);
    expect(m.registration_endpoint).toBe("https://mcp.example.test/register");
    expect(m.token_endpoint_auth_methods_supported).toEqual(["none"]);
    expect(m).not.toHaveProperty("client_id_metadata_document_supported");
  });

  it("nimmt die Rückwege von Claude, ChatGPT und lokalen Clients, sonst keine", () => {
    for (const u of [
      "https://claude.ai/api/mcp/auth_callback", CHATGPT, "https://chatgpt.com/connector/oauth/abc_123-X",
      "http://localhost:4711/callback",
    ]) expect(rueckwegErlaubt(u), u).toBe(true);
    for (const u of [
      "https://chatgpt.com.boese.test/connector_platform_oauth_redirect", "https://chatgpt.com/connector/oauth/a/b",
      "https://boese.test/callback", "http://chatgpt.com/connector_platform_oauth_redirect",
    ]) expect(rueckwegErlaubt(u), u).toBe(false);
  });

  it("registriert jeden Client als den festen öffentlichen Client, auch wenn er einen Schlüssel möchte", () => {
    const r = registriere({ redirect_uris: [CHATGPT], token_endpoint_auth_method: "private_key_jwt", client_name: "ChatGPT" }, "suite-mcp");
    expect(r).toMatchObject({ ok: true, antwort: { client_id: "suite-mcp", token_endpoint_auth_method: "none", redirect_uris: [CHATGPT] } });
    expect(registriere({ redirect_uris: ["https://boese.test/cb"] }, "suite-mcp")).toMatchObject({ ok: false, fehler: "invalid_redirect_uri" });
    expect(registriere({}, "suite-mcp")).toMatchObject({ ok: false, fehler: "invalid_redirect_uri" });
  });

  it("leitet zu Pocket ID mit eigenem Rückweg, der Challenge des Clients und den Gruppen", () => {
    const z = ort(starte());
    expect(z.origin + z.pathname).toBe(U.pocket.authorization_endpoint);
    expect(z.searchParams.get("client_id")).toBe("suite-mcp");
    expect(z.searchParams.get("redirect_uri")).toBe("https://mcp.example.test/callback");
    expect(z.searchParams.get("code_challenge")).toBe("abc");
    expect(z.searchParams.get("scope")).toContain("groups");
    expect(z.searchParams.get("state")).not.toBe("client-state");
  });

  it("leitet nie an einen fremden Rückweg und verlangt PKCE", () => {
    expect(starte("https://boese.test/cb")).toMatchObject({ art: "fehler", status: 400 });
    expect(anmeldungStarten(new URLSearchParams({ client_id: "fremd", redirect_uri: CHATGPT }), U)).toMatchObject({ art: "fehler" });
    const ohne = ort(starte(CHATGPT, { code_challenge_method: "plain" }));
    expect(ohne.searchParams.get("error")).toBe("invalid_request");
    expect(ohne.searchParams.get("iss")).toBe(U.herkunft);
  });

  it("gibt den Code an den Client zurück, mit seinem state und dem eigenen iss, und nur einmal", () => {
    const unserState = ort(starte()).searchParams.get("state")!;
    const zurueck = new URLSearchParams({ state: unserState, code: "pocket-code", iss: "https://id.example.test" });
    const z = ort(anmeldungZurueck(zurueck, U));
    expect(z.origin + z.pathname).toBe(CHATGPT);
    expect(z.searchParams.get("code")).toBe("pocket-code");
    expect(z.searchParams.get("state")).toBe("client-state");
    expect(z.searchParams.get("iss")).toBe(U.herkunft);
    expect(anmeldungZurueck(zurueck, U)).toMatchObject({ art: "fehler", status: 400 });
  });

  it("lehnt einen fremden Aussteller und eine abgelaufene Anmeldung ab", () => {
    const s1 = ort(starte()).searchParams.get("state")!;
    const fremd = ort(anmeldungZurueck(new URLSearchParams({ state: s1, code: "c", iss: "https://boese.test" }), U));
    expect(fremd.searchParams.get("error")).toBe("server_error");
    expect(fremd.searchParams.get("code")).toBeNull();
    const s2 = ort(starte()).searchParams.get("state")!;
    expect(anmeldungZurueck(new URLSearchParams({ state: s2, code: "c" }), { ...U, jetzt: U.jetzt! + 11 * 60_000 }))
      .toMatchObject({ art: "fehler" });
  });

  it("tauscht den Code mit dem eigenen Rückweg, nur passend zum Rückweg des Clients", () => {
    const s = ort(starte()).searchParams.get("state")!;
    ort(anmeldungZurueck(new URLSearchParams({ state: s, code: "pocket-code" }), U));
    expect(tokenAnfrage(new URLSearchParams({
      grant_type: "authorization_code", code: "pocket-code", code_verifier: "v", redirect_uri: "http://localhost:1/callback",
    }), U)).toMatchObject({ ok: false, fehler: "invalid_grant" });

    const s2 = ort(starte()).searchParams.get("state")!;
    ort(anmeldungZurueck(new URLSearchParams({ state: s2, code: "pocket-code-2" }), U));
    const t = tokenAnfrage(new URLSearchParams({
      grant_type: "authorization_code", code: "pocket-code-2", code_verifier: "v", redirect_uri: CHATGPT, client_id: "suite-mcp",
    }), U);
    if (!t.ok) throw new Error(t.beschreibung);
    expect(Object.fromEntries(t.formular)).toEqual({
      grant_type: "authorization_code", code: "pocket-code-2", code_verifier: "v", client_id: "suite-mcp",
      redirect_uri: "https://mcp.example.test/callback",
    });
  });

  it("reicht Refresh weiter und lehnt fremde Clients und andere Grant-Arten ab", () => {
    expect(tokenAnfrage(new URLSearchParams({ grant_type: "refresh_token", refresh_token: "r" }), U)).toMatchObject({ ok: true });
    expect(tokenAnfrage(new URLSearchParams({ grant_type: "refresh_token", refresh_token: "r", client_id: "fremd" }), U))
      .toMatchObject({ ok: false, status: 401 });
    expect(tokenAnfrage(new URLSearchParams({ grant_type: "client_credentials" }), U)).toMatchObject({ ok: false, fehler: "unsupported_grant_type" });
  });
});
