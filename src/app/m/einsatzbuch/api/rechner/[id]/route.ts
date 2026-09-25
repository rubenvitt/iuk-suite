/**
 * Schnittstelle 8 der Anbindung: Die Verwaltung löscht ihren eigenen Test-Rechner. Die
 * Zugehörigkeit wird aus der Sitzung aufgelöst, nie aus der URL-`id` allein (IDOR, `CLAUDE.md`
 * „Zugriffsschutz"): eine fremde Test-`id` scheitert an `fremder_rechner`, auch wenn sie ein
 * echter Test-Rechner ist.
 */
import { eq } from "drizzle-orm";
import { auditActor, auditDenied, withAuditContext } from "@/core/audit/server";
import { rechner } from "../../../_db/schema";
import { getDb } from "../../../_db/client";
import { hostAbweisung } from "../../../_lib/hostRiegel";
import { loescheTestRechner } from "../../../_lib/anbindung/rechner";
import { sitzungAus } from "../../../_lib/anbindung/sitzung";
import { bearerAus } from "../../../_lib/anbindung/token";
import { fehler } from "../../../_lib/anbindung/vertrag";

export const dynamic = "force-dynamic";

type RouteKontext = { params: Promise<{ id: string }> };

export async function DELETE(req: Request, ctx: RouteKontext) {
  const ab = hostAbweisung(req); if (ab) return ab;
  const db = getDb();
  const jetzt = new Date();
  const s = sitzungAus(db, bearerAus(req), jetzt);
  if (!s) {
    auditDenied("einsatzbuch");
    return fehler(401, "sitzung_ungueltig", "Die Sitzung gilt nicht mehr.");
  }
  const { id } = await ctx.params;

  const ziel = db.select({ id: rechner.id, art: rechner.art }).from(rechner).where(eq(rechner.id, id)).get();
  if (!ziel) return fehler(404, "unbekannt", "Diesen Rechner gibt es nicht.");
  if (ziel.art !== "test") return fehler(403, "nur_test", "Ein echter Rechner wird nie gelöscht, nur widerrufen.");
  if (ziel.id !== s.rechnerId) return fehler(403, "fremder_rechner", "Dieser Test-Rechner ist nicht der Rechner dieser Sitzung.");

  return withAuditContext({ actor: auditActor({ sub: s.sub, name: s.name }) }, () => {
    loescheTestRechner(db, id);
    return new Response(null, { status: 204 });
  });
}
