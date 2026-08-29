import { NextResponse } from "next/server";
import { getDb } from "../../../../_db/client";
import { hostAbweisung } from "../../../../_lib/hostRiegel";
import { adminAbweisung } from "../../../../_lib/requireUavAdmin";
import { reorderSchema } from "../../../../_lib/adminSchemas";
import { tasksNeuSortieren } from "../../../../_lib/queries";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ab = hostAbweisung(req) ?? (await adminAbweisung()); if (ab) return ab;
  let raw: unknown; try { raw = await req.json(); } catch { return NextResponse.json({ error: { code: "invalid_json", message: "Ungültiger JSON-Body" } }, { status: 400 }); }
  const parsed = reorderSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: { code: "validation_error", message: parsed.error.message } }, { status: 400 });
  tasksNeuSortieren(getDb(), parsed.data.ids);
  return NextResponse.json({ ok: true });
}
