/**
 * DAS FOTO ZU EINEM MANGEL — nur für Verwalter der Gruppe des Geräts und Admins. Ein Route Handler hat kein
 * Layout: Host, Sitzung und Gruppe prüft er selbst, die Gruppe aus der Datenbank (IDOR).
 * Ausgeliefert werden nur Bytes, die der Server beim Melden selbst geschrieben hat (`_lib/fotos.ts`).
 */
import { getDb } from "../../../../_db/client";
import { ladeMangel } from "../../../../_lib/daten";
import { idSchema } from "../../../../_lib/eingabe";
import { leseFoto } from "../../../../_lib/fotos";
import { hostAbweisung } from "../../../../_lib/host";
import { requireAktion, verwaltetGruppe } from "../../../../_lib/zugang";

export const dynamic = "force-dynamic";

const NICHTS = () => new Response(null, { status: 404 });

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ab = hostAbweisung(req);
  if (ab) return ab;
  let rechte;
  try {
    ({ rechte } = await requireAktion("verwalter"));
  } catch {
    return NICHTS();
  }
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return NICHTS();
  const m = ladeMangel(getDb(), id);
  if (!m || !m.foto || !verwaltetGruppe(rechte, m.gruppeId)) return NICHTS();
  const bytes = await leseFoto(m.id);
  if (!bytes) return NICHTS();
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": "image/jpeg",
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
}
