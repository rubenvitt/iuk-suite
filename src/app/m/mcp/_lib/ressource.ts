/**
 * Der MCP-Server als OAuth-Ressource (RFC 9728, MCP-Autorisierung): wo er steht, wer seine Tokens ausstellt und
 * wie ein Client das erfährt. Ein Client ohne Token bekommt 401 mit `WWW-Authenticate` und dem Verweis auf die
 * Metadaten; dort steht der MCP-Host selbst als Autorisierungsserver, der für Anmeldung und Token an Pocket ID
 * verweist und nur die Registrierung selbst beantwortet (`vermittlung.ts`).
 */
import { moduleForHost } from "@/core/registry";
import { resolveHost } from "@/core/routing";

/** Der Pfad des Endpunkts auf dem MCP-Host. */
export const MCP_PFAD = "/mcp";

/** Was ein Client anfragen soll: `groups`, sonst kennt der Server die Rechte nicht. */
export const MCP_SCOPES = ["openid", "profile", "email", "groups"] as const;

export function istMcpHost(kopf: Headers): boolean {
  return moduleForHost(resolveHost(kopf))?.key === "mcp";
}

/** `https://mcp.iuk-ue.de` — aus der Anfrage, wie sie beim Proxy ankam. */
export function herkunft(kopf: Headers): string {
  const proto = kopf.get("x-forwarded-proto")?.split(",")[0].trim() || "http";
  return `${proto}://${resolveHost(kopf)}`;
}

export function ressourceUrl(kopf: Headers): string {
  return `${herkunft(kopf)}${MCP_PFAD}`;
}

export function metadatenUrl(kopf: Headers): string {
  return `${herkunft(kopf)}/.well-known/oauth-protected-resource${MCP_PFAD}`;
}

export function geschuetzteRessource(kopf: Headers) {
  return {
    resource: ressourceUrl(kopf),
    authorization_servers: [herkunft(kopf)],
    scopes_supported: [...MCP_SCOPES],
    bearer_methods_supported: ["header"],
    resource_name: "IUK-Suite",
  };
}

/** 401 mit dem Weg zur Anmeldung. `ungueltig`: ein Token kam, taugt aber nicht (RFC 6750 `invalid_token`). */
export function anmeldungNoetig(kopf: Headers, ungueltig: boolean): Response {
  const teile = [
    `resource_metadata="${metadatenUrl(kopf)}"`,
    `scope="${MCP_SCOPES.join(" ")}"`,
    ...(ungueltig ? ['error="invalid_token"'] : []),
  ];
  return new Response(JSON.stringify({ error: ungueltig ? "invalid_token" : "unauthorized" }), {
    status: 401,
    headers: { "content-type": "application/json", "www-authenticate": `Bearer ${teile.join(", ")}`, "cache-control": "no-store" },
  });
}
