import { withAuditContext, auditActor } from "@/core/audit/server";
import { NextResponse } from "next/server";
import { getDb } from "../../../../_db/client";
import { hostAbweisung } from "../../../../_lib/hostRiegel";
import { adminZugang } from "../../../../_lib/requireUavAdmin";
import { taskPatchSchema } from "../../../../_lib/adminSchemas";
import { NotFound, taskAendern, taskLoeschen } from "../../../../_lib/queries";

export const dynamic = "force-dynamic";

type RouteKontext = { params: Promise<{ id: string }> };

const notFoundJson = (e: NotFound) => NextResponse.json({ error: { code: e.code, message: e.message } }, { status: 404 });

export async function PATCH(req: Request, ctx: RouteKontext) {
  const ab = hostAbweisung(req); if (ab) return ab;
  const zugang = await adminZugang(); if (!zugang.ok) return zugang.response;
  return withAuditContext({ actor: auditActor(zugang.viewer) }, async () => {
    const { id } = await ctx.params;
    let raw: unknown; try { raw = await req.json(); } catch { return NextResponse.json({ error: { code: "invalid_json", message: "Ungültiger JSON-Body" } }, { status: 400 }); }
    const parsed = taskPatchSchema.safeParse(raw);
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
  });
}

export async function DELETE(req: Request, ctx: RouteKontext) {
  const ab = hostAbweisung(req); if (ab) return ab;
  const zugang = await adminZugang(); if (!zugang.ok) return zugang.response;
  return withAuditContext({ actor: auditActor(zugang.viewer) }, async () => {
    const { id } = await ctx.params;
    try {
      taskLoeschen(getDb(), id);
      return NextResponse.json({ ok: true });
    } catch (e) {
      if (e instanceof NotFound) return notFoundJson(e);
      throw e;
    }
  });
}
