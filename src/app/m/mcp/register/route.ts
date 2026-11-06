/** Registrierung (RFC 7591): jeder MCP-Client bekommt den festen Client „Suite MCP“ (`_lib/vermittlung.ts`). */
import { headers } from "next/headers";
import { istMcpHost } from "../_lib/ressource";
import { mcpClientIds } from "../_lib/token";
import { registriere } from "../_lib/vermittlung";

export const dynamic = "force-dynamic";

const KOPF = { "cache-control": "no-store", "access-control-allow-origin": "*" };

export async function POST(req: Request): Promise<Response> {
  const kopf = await headers();
  if (!istMcpHost(kopf)) return new Response("Not found", { status: 404 });
  const [clientId] = mcpClientIds();
  if (!clientId) return new Response("MCP-Server nicht eingerichtet", { status: 503 });
  const eingabe: unknown = await req.json().catch(() => null);
  const r = registriere(eingabe, clientId);
  if (!r.ok) return Response.json({ error: r.fehler, error_description: r.beschreibung }, { status: 400, headers: KOPF });
  return Response.json(r.antwort, { status: 201, headers: KOPF });
}

/** Preflight für Clients im Browser: ein POST mit JSON fragt vorher an. */
export function OPTIONS(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type",
      "access-control-max-age": "86400",
    },
  });
}
