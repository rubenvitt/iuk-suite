import { NextResponse } from "next/server";
import { getDb } from "../../../_db/client";
import { hostAbweisung } from "../../../_lib/hostRiegel";
import { adminAbweisung } from "../../../_lib/requireUavAdmin";
import { taskAnlegenSchema } from "../../../_lib/adminSchemas";
import { alleTasks, taskAnlegen } from "../../../_lib/queries";

export const dynamic = "force-dynamic";

/** Katalog inklusive inaktiver Aufgaben — nur für die Verwaltung. */
export async function GET(req: Request) {
  const ab = hostAbweisung(req) ?? (await adminAbweisung()); if (ab) return ab;
  return NextResponse.json(alleTasks(getDb(), true));
}

export async function POST(req: Request) {
  const ab = hostAbweisung(req) ?? (await adminAbweisung()); if (ab) return ab;
  let raw: unknown; try { raw = await req.json(); } catch { return NextResponse.json({ error: { code: "invalid_json", message: "Ungültiger JSON-Body" } }, { status: 400 }); }
  const parsed = taskAnlegenSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: { code: "validation_error", message: parsed.error.message } }, { status: 400 });
  const body = parsed.data;
  const task = taskAnlegen(getDb(), {
    id: body.id,
    teil: body.teil,
    nummer: body.nummer,
    titel: body.titel,
    lernziel: body.lernziel,
    schritte: body.schritte,
    durchfuehrungshinweise: body.durchfuehrungshinweise,
    sicherheitshinweise: body.sicherheitshinweise,
    zielanzahlDefault: body.zielanzahlDefault,
    // Kein Default: fehlendes sortOrder lässt taskAnlegen ans Ende anhängen
    // (maxSort + 1) — ein `?? 0` würde das aushebeln.
    sortOrder: body.sortOrder,
    aktiv: body.aktiv,
    bildUrl: body.bildUrl?.trim() ? body.bildUrl.trim() : null,
  });
  return NextResponse.json(task, { status: 201 });
}
