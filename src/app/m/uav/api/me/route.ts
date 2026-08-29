import { getDb } from "../../_db/client";
import { hostAbweisung } from "../../_lib/hostRiegel";
import { identitaetAus } from "../../_lib/identitaet";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const abweisung = hostAbweisung(req); if (abweisung) return abweisung;
  return Response.json(await identitaetAus(req, getDb()));
}
