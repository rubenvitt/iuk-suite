import { withAuditContext, auditActor } from "@/core/audit/server";
import { NextResponse } from "next/server";
import { getDb } from "../../../../_db/client";
import { hostAbweisung } from "../../../../_lib/hostRiegel";
import { adminZugang } from "../../../../_lib/requireUavAdmin";
import { teilnehmerPatchSchema } from "../../../../_lib/adminSchemas";
import { NotFound, teilnehmerAendern, teilnehmerDetail, teilnehmerLoeschen } from "../../../../_lib/queries";

export const dynamic = "force-dynamic";

type RouteKontext = { params: Promise<{ id: string }> };

const notFoundJson = (e: NotFound) => NextResponse.json({ error: { code: e.code, message: e.message } }, { status: 404 });

/** Detail-Auswertung eines Teilnehmers. */
export async function GET(req: Request, ctx: RouteKontext) {
  const ab = hostAbweisung(req); if (ab) return ab;
  const zugang = await adminZugang(); if (!zugang.ok) return zugang.response;
  const { id } = await ctx.params;
  try {
    return NextResponse.json(teilnehmerDetail(getDb(), id));
  } catch (e) {
    if (e instanceof NotFound) return notFoundJson(e);
    throw e;
  }
}

export async function PATCH(req: Request, ctx: RouteKontext) {
  const ab = hostAbweisung(req); if (ab) return ab;
  const zugang = await adminZugang(); if (!zugang.ok) return zugang.response;
  return withAuditContext({ actor: auditActor(zugang.viewer) }, async () => {
    const { id } = await ctx.params;
    let body: unknown; try { body = await req.json(); } catch { return NextResponse.json({ error: { code: "invalid_json", message: "Ungültiger JSON-Body" } }, { status: 400 }); }
    const parsed = teilnehmerPatchSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: { code: "validation_error", message: parsed.error.message } }, { status: 400 });
    try {
      return NextResponse.json(teilnehmerAendern(getDb(), id, parsed.data));
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
      teilnehmerLoeschen(getDb(), id);
      return NextResponse.json({ ok: true });
    } catch (e) {
      if (e instanceof NotFound) return notFoundJson(e);
      throw e;
    }
  });
}
