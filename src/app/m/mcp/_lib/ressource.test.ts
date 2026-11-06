import { describe, expect, it } from "vitest";
import { anmeldungNoetig, geschuetzteRessource, istMcpHost } from "./ressource";

const kopf = (host: string) => new Headers({ host, "x-forwarded-proto": "https" });

describe("Der MCP-Server als OAuth-Ressource", () => {
  it("antwortet nur auf seinem Host", () => {
    expect(istMcpHost(kopf("mcp.localtest.me:3000"))).toBe(true);
    expect(istMcpHost(kopf("wartung.localtest.me:3000"))).toBe(false);
  });

  it("nennt sich selbst als Autorisierungsserver und verlangt die Gruppen", () => {
    expect(geschuetzteRessource(kopf("mcp.localtest.me"))).toEqual({
      resource: "https://mcp.localtest.me/mcp",
      authorization_servers: ["https://mcp.localtest.me"],
      scopes_supported: ["openid", "profile", "email", "groups"],
      bearer_methods_supported: ["header"],
      resource_name: "IUK-Suite",
    });
  });

  it("401 zeigt den Weg zu den Metadaten (RFC 9728, Abschnitt 5.1)", () => {
    const r = anmeldungNoetig(kopf("mcp.localtest.me"), true);
    expect(r.status).toBe(401);
    expect(r.headers.get("www-authenticate")).toBe(
      'Bearer resource_metadata="https://mcp.localtest.me/.well-known/oauth-protected-resource/mcp", scope="openid profile email groups", error="invalid_token"',
    );
    expect(anmeldungNoetig(kopf("mcp.localtest.me"), false).headers.get("www-authenticate")).not.toContain("error=");
  });
});
