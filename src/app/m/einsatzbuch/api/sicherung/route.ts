/**
 * Schnittstelle 6 der Anbindung: Der Rechner meldet den Zeitpunkt seiner letzten Sicherung.
 * Reine Kontaktzeit (`AUDIT_TABLES.einsatzbuch.rechner.unauditedColumns`), wie `letzterKontakt` —
 * Sicherungsordner, Export und PDF selbst gehören zu Stufe 6 (Entscheidung 14).
 */
import { eq } from "drizzle-orm";
import { auditDenied, withAuditContext } from "@/core/audit/server";
import { rechner } from "../../_db/schema";
import { getDb } from "../../_db/client";
import { hostAbweisung } from "../../_lib/hostRiegel";
import { rechnerAusToken } from "../../_lib/anbindung/geraet";
import { begrenztesJson } from "../../_lib/anbindung/koerper";
import { bearerAus } from "../../_lib/anbindung/token";
import { fehler, sicherungAnfrage } from "../../_lib/anbindung/vertrag";

export const dynamic = "force-dynamic";

// 8 KiB: `{erstellt}` braucht nie mehr (Tabelle „Schnittstellen", Nr. 6).
const MAX_BODY_BYTES = 8 * 1024;

export async function POST(req: Request) {
  const ab = hostAbweisung(req); if (ab) return ab;
  const db = getDb();
  const r = rechnerAusToken(db, bearerAus(req));
  if (!r) {
    auditDenied("einsatzbuch");
    return fehler(401, "geraet_ungueltig", "Das Geräte-Token gilt nicht mehr.");
  }

  const body = await begrenztesJson(req, MAX_BODY_BYTES, "Anfrage ist zu groß"); if (!body.ok) return body.response;
  const parsed = sicherungAnfrage.safeParse(body.body);
  if (!parsed.success) return fehler(400, "validation_error", parsed.error.message);

  return withAuditContext({ actor: { kind: "access", id: `einsatzbuch:rechner:${r.id}`, name: r.name } }, () => {
    db.update(rechner).set({ letzteSicherung: parsed.data.erstellt }).where(eq(rechner.id, r.id)).run();
    return new Response(null, { status: 204 });
  });
}
