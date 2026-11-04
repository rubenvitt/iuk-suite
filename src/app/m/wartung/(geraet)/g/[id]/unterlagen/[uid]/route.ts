/**
 * EINE UNTERLAGE AM GERÄT ÖFFNEN (IDA-300) — für jeden mit dem QR-Code, auch ohne Anmeldung, solange das Gerät
 * aktiv ist; an einem ausgemusterten nur für Verwalter seiner Gruppe. Gerät und Gruppe kommen aus der Datenbank:
 * die Unterlage muss zum Gerät der Adresse gehören. Ein Route Handler hat kein Layout und riegelt selbst.
 *
 * Ausgeliefert werden nur Bytes, die der Server beim Hochladen geprüft hat (`_lib/unterlagen.ts`). Ein Bild läuft
 * unter `sandbox`; ein PDF nicht, denn die PDF-Anzeige der Browser öffnet in einem `sandbox`-Dokument nichts.
 */
import { getDb } from "../../../../../_db/client";
import { ladeUnterlage } from "../../../../../_lib/daten";
import { idSchema } from "../../../../../_lib/eingabe";
import { hostAbweisung } from "../../../../../_lib/host";
import { anzeigeKopf, leseUnterlage } from "../../../../../_lib/unterlagen";
import { besucher, verwaltetGruppe } from "../../../../../_lib/zugang";

export const dynamic = "force-dynamic";

const NICHTS = () => new Response(null, { status: 404, headers: { "cache-control": "no-store" } });

export async function GET(req: Request, { params }: { params: Promise<{ id: string; uid: string }> }): Promise<Response> {
  const ab = hostAbweisung(req);
  if (ab) return ab;
  const { id, uid } = await params;
  if (!idSchema.safeParse(id).success || !idSchema.safeParse(uid).success) return NICHTS();
  const u = ladeUnterlage(getDb(), uid);
  if (!u || u.geraetId !== id) return NICHTS();
  if (!u.aktiv && !verwaltetGruppe((await besucher()).rechte, u.gruppeId)) return NICHTS();
  const bytes = await leseUnterlage(u.id, u.typ);
  if (!bytes) return NICHTS();
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": u.typ === "pdf" ? "application/pdf" : "image/jpeg",
      "content-disposition": anzeigeKopf(u.titel, u.typ),
      "content-length": String(bytes.byteLength),
      "cache-control": "private, max-age=300",
      "x-content-type-options": "nosniff",
      "content-security-policy": u.typ === "pdf" ? "default-src 'none'; object-src 'self'; frame-ancestors 'self'" : "default-src 'none'; sandbox",
    },
  });
}
