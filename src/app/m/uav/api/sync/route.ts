import { NextResponse } from "next/server";
import { getDb } from "../../_db/client";
import { hostAbweisung } from "../../_lib/hostRiegel";
import { identitaetAus } from "../../_lib/identitaet";
import { sync } from "../../_lib/queries";
import { syncSchema } from "../../_lib/syncSchema";

export const dynamic = "force-dynamic";

const fehler = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status });

/** Nur Teilnehmer — participantId stammt aus der Identität, nie aus dem Body. */
export async function POST(req: Request) {
  const abweisung = hostAbweisung(req); if (abweisung) return abweisung;
  const db = getDb();
  const identitaet = await identitaetAus(req, db);
  if (identitaet.kind !== "participant") return fehler(401, "unauthorized", "Nur für Teilnehmer");
  let body: unknown; try { body = await req.json(); } catch { return fehler(400, "invalid_json", "Ungültiger JSON-Body"); }
  const parsed = syncSchema.safeParse(body);
  if (!parsed.success) return fehler(400, "validation_error", parsed.error.message);
  return NextResponse.json(sync(db, identitaet.id, parsed.data));
}
