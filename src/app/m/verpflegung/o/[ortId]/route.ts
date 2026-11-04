import { NextResponse } from "next/server";
import { idSchema } from "../../_lib/eingabe";
import { hostAbweisung } from "../../_lib/host";

export const dynamic = "force-dynamic";

/**
 * Das Ortsetikett `/o/<id>` mit der Systemkamera gescannt: weiter aufs Telefon mit diesem Ort. Kein Zugang
 * nötig, um umzuleiten; das Telefon riegelt selbst.
 */
export async function GET(req: Request, ctx: { params: Promise<{ ortId: string }> }) {
  const ab = hostAbweisung(req);
  if (ab) return ab;
  const { ortId } = await ctx.params;
  const ziel = idSchema.safeParse(ortId).success ? `/h?ort=${encodeURIComponent(ortId)}` : "/h";
  return new NextResponse(null, { status: 303, headers: { Location: ziel } });
}
