/**
 * DER ENDPUNKT DES MCP-SERVERS (IDA-367): `https://<SUITE_HOST_MCP>/mcp`, Streamable HTTP, zustandslos.
 * Ohne gültiges Pocket-ID-Token 401 mit dem Weg zur Anmeldung (`_lib/ressource.ts`); mit Token ein Server, der nur
 * die Werkzeuge dieser Person kennt (`_lib/server.ts`). Nur auf dem MCP-Host: `/m/mcp/*` ist auf jedem
 * Suite-Host erreichbar.
 */
import { headers } from "next/headers";
import { anmeldungNoetig, istMcpHost } from "../_lib/ressource";
import { beantworte } from "../_lib/server";
import { pocketIdPruefer, pruefeToken } from "../_lib/token";

export const dynamic = "force-dynamic";

async function bearbeite(req: Request): Promise<Response> {
  const kopf = await headers();
  if (!istMcpHost(kopf)) return new Response("Not found", { status: 404 });
  const pruefer = pocketIdPruefer();
  if (!pruefer) return new Response("MCP-Server nicht eingerichtet", { status: 503 });
  const t = await pruefeToken(req.headers.get("authorization"), pruefer);
  if (!t.ok) return anmeldungNoetig(kopf, t.grund === "ungueltig");
  return beantworte(req, t.person);
}

export const POST = bearbeite;
// Zustandslos gibt es keinen Ereignisstrom und keine Sitzung zum Beenden (MCP: 405 ist dann erlaubt).
export async function GET(req: Request): Promise<Response> {
  const kopf = await headers();
  if (!istMcpHost(kopf)) return new Response("Not found", { status: 404 });
  if (!req.headers.get("authorization")) return anmeldungNoetig(kopf, false);
  return new Response(null, { status: 405, headers: { allow: "POST" } });
}
export async function DELETE(): Promise<Response> {
  return new Response(null, { status: 405, headers: { allow: "POST" } });
}
