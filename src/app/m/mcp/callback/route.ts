/** Rückweg von Pocket ID (`/callback`): der Code geht an den Rückweg des Clients (`_lib/vermittlung.ts`). */
import { headers } from "next/headers";
import { anmeldungZurueck, umfeldFuer } from "../_lib/vermittlung";
import { alsAntwort } from "../_lib/weiter";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const u = await umfeldFuer(await headers()).catch(() => undefined);
  if (u === null) return new Response("Not found", { status: 404 });
  if (!u) return new Response("Pocket ID nicht erreichbar", { status: 502 });
  return alsAntwort(anmeldungZurueck(new URL(req.url).searchParams, u));
}
