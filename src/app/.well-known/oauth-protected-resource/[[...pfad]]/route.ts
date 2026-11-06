import { headers } from "next/headers";
import { geschuetzteRessource, istMcpHost } from "@/app/m/mcp/_lib/ressource";

/**
 * Die Metadaten des MCP-Servers als geschützte Ressource (RFC 9728, IDA-367), unter `/.well-known/…` und
 * `/.well-known/…/mcp` (Clients fragen beide). Global, weil `/.well-known` am Modul-Rewrite vorbeiläuft
 * (PASSTHROUGH in `core/routing.ts`); geantwortet wird nur auf dem MCP-Host.
 */
export async function GET(): Promise<Response> {
  const kopf = await headers();
  const issuer = process.env.POCKET_ID_ISSUER;
  if (!istMcpHost(kopf) || !issuer) return new Response("Not found", { status: 404 });
  return Response.json(geschuetzteRessource(kopf), { headers: { "cache-control": "public, max-age=300" } });
}
