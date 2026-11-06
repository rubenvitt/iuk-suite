/**
 * Ein MCP-Server je Anfrage (zustandslos, Streamable HTTP mit JSON-Antworten): er kennt nur die Person dieser
 * Anfrage und meldet nur die Werkzeuge an, die sie sehen darf. Zustandslos, weil die Suite mehrere Prozesse
 * haben kann und ein Werkzeug nichts zwischen zwei Aufrufen behält.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { LATEST_PROTOCOL_VERSION, SUPPORTED_PROTOCOL_VERSIONS } from "@modelcontextprotocol/sdk/types.js";
import { MCP_MODULE } from "./module";
import type { McpModul } from "./modul";
import type { McpPerson } from "./token";

export const MCP_ANWEISUNGEN =
  "Werkzeuge der IUK-Suite (DRK). Du handelst im Namen der angemeldeten Person und kannst nie mehr, als sie in der " +
  "App darf. Personenbezogene Daten und die Vergabe von Rechten gibt es hier nicht. Werkzeuge heißen nach ihrem Modul, z. B. wartung_… für die Gerätewartung. Vor einem schreibenden " +
  "Werkzeug die nötigen Kennungen mit den lesenden holen.";

export function bauServer(person: McpPerson, module: readonly McpModul[] = MCP_MODULE): McpServer {
  const server = new McpServer(
    { name: "iuk-suite", title: "IUK-Suite", version: "1.0.0" },
    { instructions: MCP_ANWEISUNGEN, capabilities: { tools: {} } },
  );
  for (const m of module) m.registriere(server, person);
  return server;
}

/**
 * Ein Client mit einer neueren Protokollversion, als das SDK kennt (Claude nach einem Spec-Release), bekäme vom
 * Transport 400 auf jede Anfrage. Zustandslos handelt `initialize` die Version ohnehin aus, und die Werkzeuge hängen
 * an keiner Version: also eine neuere Version im Kopf durch die neueste bekannte ersetzen. Ungültige oder ältere
 * unbekannte Versionen bleiben stehen und bekommen vom Transport weiter 400.
 */
export function mitBekannterVersion(req: Request): Request {
  const version = req.headers.get("mcp-protocol-version");
  if (version === null || SUPPORTED_PROTOCOL_VERSIONS.includes(version)) return req;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(version) || version <= LATEST_PROTOCOL_VERSION) return req;
  const kopf = new Headers(req.headers);
  kopf.set("mcp-protocol-version", LATEST_PROTOCOL_VERSION);
  return new Request(req, { headers: kopf });
}

export async function beantworte(req: Request, person: McpPerson, module?: readonly McpModul[]): Promise<Response> {
  const server = bauServer(person, module);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(mitBekannterVersion(req));
  } finally {
    await server.close().catch(() => undefined);
  }
}
