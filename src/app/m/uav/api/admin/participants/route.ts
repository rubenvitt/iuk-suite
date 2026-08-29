import { NextResponse } from "next/server";
import { getDb } from "../../../_db/client";
import { hostAbweisung } from "../../../_lib/hostRiegel";
import { adminAbweisung } from "../../../_lib/requireUavAdmin";
import { teilnehmerAnlegenSchema } from "../../../_lib/adminSchemas";
import { teilnehmerAnlegen, teilnehmerUebersicht } from "../../../_lib/queries";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  return hostAbweisung(req) ?? (await adminAbweisung()) ?? Response.json(teilnehmerUebersicht(getDb()));
}
export async function POST(req: Request) {
  const ab = hostAbweisung(req) ?? (await adminAbweisung()); if (ab) return ab;
  let body: unknown; try { body = await req.json(); } catch { return NextResponse.json({ error: { code: "invalid_json", message: "Ungültiger JSON-Body" } }, { status: 400 }); }
  const parsed = teilnehmerAnlegenSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: { code: "validation_error", message: parsed.error.message } }, { status: 400 });
  return NextResponse.json(teilnehmerAnlegen(getDb(), parsed.data.name, parsed.data.beginn ?? null), { status: 201 });
}
