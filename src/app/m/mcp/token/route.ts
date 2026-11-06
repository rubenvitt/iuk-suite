/** Token (`/token`): weiter an Pocket ID, mit dem eigenen Rückweg (`_lib/vermittlung.ts`). */
import { headers } from "next/headers";
import { tokenAnfrage, umfeldFuer } from "../_lib/vermittlung";

export const dynamic = "force-dynamic";

const KOPF = { "cache-control": "no-store", "access-control-allow-origin": "*" };

export async function POST(req: Request): Promise<Response> {
  const u = await umfeldFuer(await headers()).catch(() => undefined);
  if (u === null) return new Response("Not found", { status: 404 });
  if (!u) return Response.json({ error: "temporarily_unavailable" }, { status: 503, headers: KOPF });
  const formular = new URLSearchParams(await req.text().catch(() => ""));
  const t = tokenAnfrage(formular, u);
  if (!t.ok) return Response.json({ error: t.fehler, error_description: t.beschreibung }, { status: t.status, headers: KOPF });
  const r = await fetch(u.pocket.token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: t.formular,
    cache: "no-store",
  }).catch(() => null);
  if (!r) return Response.json({ error: "temporarily_unavailable" }, { status: 503, headers: KOPF });
  return new Response(await r.text(), {
    status: r.status,
    headers: { ...KOPF, "content-type": r.headers.get("content-type") ?? "application/json" },
  });
}
