import { headers } from "next/headers";
import { herkunft, istMcpHost } from "@/app/m/mcp/_lib/ressource";
import { mcpClientIds } from "@/app/m/mcp/_lib/token";
import { autorisierungsserver } from "@/app/m/mcp/_lib/vermittlung";

export const dynamic = "force-dynamic";

/**
 * Der MCP-Host als Autorisierungsserver (RFC 8414), der an Pocket ID vermittelt (`m/mcp/_lib/vermittlung.ts`).
 * Unter `/.well-known/…` und `/.well-known/…/mcp`; nur auf dem MCP-Host.
 */
export async function GET(): Promise<Response> {
  const kopf = await headers();
  if (!istMcpHost(kopf) || !process.env.POCKET_ID_ISSUER || mcpClientIds().length === 0) {
    return new Response("Not found", { status: 404 });
  }
  return Response.json(autorisierungsserver(herkunft(kopf)), {
    headers: { "cache-control": "public, max-age=300", "access-control-allow-origin": "*" },
  });
}
