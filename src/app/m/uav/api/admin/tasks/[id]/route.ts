import { NextResponse } from "next/server";
import { getDb } from "../../../../_db/client";
import { hostAbweisung } from "../../../../_lib/hostRiegel";
import { adminAbweisung } from "../../../../_lib/requireUavAdmin";
import { taskPatchSchema } from "../../../../_lib/adminSchemas";
import { NotFound, taskAendern, taskLoeschen } from "../../../../_lib/queries";

export const dynamic = "force-dynamic";

type RouteKontext = { params: Promise<{ id: string }> };

const notFoundJson = (e: NotFound) => NextResponse.json({ error: { code: e.code, message: e.message } }, { status: 404 });

export async function PATCH(req: Request, ctx: RouteKontext) {
  const ab = hostAbweisung(req) ?? (await adminAbweisung()); if (ab) return ab;
  const { id } = await ctx.params;
  const parsed = taskPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: "validation_error", message: parsed.error.message } }, { status: 400 });
  // Leerer String = Bild entfernen (→ null); fehlendes Feld = unverändert lassen;
  // explizites `null` bleibt als Schlüssel erhalten und entfernt das Bild ebenso
  // (Alt `admin.ts:167-170` — nur der Zweig `typeof === "string"` normalisiert,
  // `null` läuft unverändert durch `patch` und überschreibt trotzdem).
  const patch = typeof parsed.data.bildUrl === "string"
    ? { ...parsed.data, bildUrl: parsed.data.bildUrl.trim() || null }
    : parsed.data;
  try {
    return NextResponse.json(taskAendern(getDb(), id, patch));
  } catch (e) {
    if (e instanceof NotFound) return notFoundJson(e);
    throw e;
  }
}

export async function DELETE(req: Request, ctx: RouteKontext) {
  const ab = hostAbweisung(req) ?? (await adminAbweisung()); if (ab) return ab;
  const { id } = await ctx.params;
  try {
    taskLoeschen(getDb(), id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof NotFound) return notFoundJson(e);
    throw e;
  }
}
