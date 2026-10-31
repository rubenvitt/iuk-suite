/**
 * EIN FOTO EINER MÄNGELMELDUNG (IDA-298) — nur für die Verwaltung des Lagerbuchs.
 *
 * ⚠️ DAS LAYOUT DER GRUPPE `(arbeit)` RIEGELT HIER NICHT: ein Route Handler hat kein Layout. Host und
 * Verwaltungsrecht prüft deshalb dieser Handler selbst, in derselben Form wie das Checklisten-PDF.
 *
 * Ausgeliefert werden nur Bytes, die der Server beim Melden selbst geschrieben hat (`_lib/maengel/fotos.ts`).
 */
import { auditActor, auditDenied } from "@/core/audit/server";
import { headers } from "next/headers";
import { auth } from "@/core/auth";
import { getDb } from "../../../../../../_db/client";
import { lagerbuchHostOderNull } from "../../../../../../_lib/host";
import { mangel } from "../../../../../../_lib/maengel/daten";
import { leseFoto } from "../../../../../../_lib/maengel/fotos";
import { istLagerbuchAdmin, viewerAusSession } from "../../../../../../_lib/zugang";

export const dynamic = "force-dynamic";

const NICHTS = () => new Response(null, { status: 404 });

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; nummer: string }> },
): Promise<Response> {
  if (lagerbuchHostOderNull(await headers()) === null) return NICHTS();
  const viewer = viewerAusSession(await auth());
  if (!istLagerbuchAdmin(viewer)) { auditDenied("lagerbuch", auditActor(viewer)); return NICHTS(); }

  const { id, nummer: roh } = await params;
  const nummer = /^\d$/.test(roh) ? Number(roh) : -1;
  const m = mangel(getDb(), id);
  if (!m || nummer < 0 || nummer >= m.fotos) return NICHTS();

  const bytes = await leseFoto(m.id, nummer);
  if (!bytes) return NICHTS();
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": "image/jpeg",
      "cache-control": "private, max-age=3600",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
}
