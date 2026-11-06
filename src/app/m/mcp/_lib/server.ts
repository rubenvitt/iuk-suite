/**
 * Ein MCP-Server je Anfrage (zustandslos, Streamable HTTP mit JSON-Antworten): er kennt nur die Person dieser
 * Anfrage und meldet nur die Werkzeuge an, die sie sehen darf. Zustandslos, weil die Suite mehrere Prozesse
 * haben kann und ein Werkzeug nichts zwischen zwei Aufrufen behält.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { MCP_MODULE } from "./module";
import type { McpModul } from "./modul";
import type { McpPerson } from "./token";

export const MCP_ANWEISUNGEN =
  "Werkzeuge der IUK-Suite (DRK). Du handelst im Namen der angemeldeten Person und kannst genau das, was sie in der " +
  "App darf. Werkzeuge heißen nach ihrem Modul, z. B. wartung_… für die Gerätewartung. Vor einem schreibenden " +
  "Werkzeug die nötigen Kennungen mit den lesenden holen.";

export function bauServer(person: McpPerson, module: readonly McpModul[] = MCP_MODULE): McpServer {
  const server = new McpServer(
    { name: "iuk-suite", title: "IUK-Suite", version: "1.0.0" },
    { instructions: MCP_ANWEISUNGEN, capabilities: { tools: {} } },
  );
  for (const m of module) m.registriere(server, person);
  return server;
}

export async function beantworte(req: Request, person: McpPerson, module?: readonly McpModul[]): Promise<Response> {
  const server = bauServer(person, module);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } finally {
    await server.close().catch(() => undefined);
  }
}
