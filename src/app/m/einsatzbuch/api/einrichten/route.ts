/**
 * Schnittstelle 3 der Anbindung: Die App richtet mit ihrer Verwaltungssitzung einen Rechner ein.
 * `richteEin` trägt bereits einen eigenen Audit-Kontext (Task 2); die Hülle hier umhüllt zusätzlich
 * mit dem Akteur der Sitzung, damit die Manifest-Zusage `context` unabhängig von der Fachfunktion
 * gilt — der innere Kontext gewinnt (`withAuditContext` verschachtelt).
 */
import { auditActor, auditDenied, withAuditContext } from "@/core/audit/server";
import { getDb } from "../../_db/client";
import { hostAbweisung } from "../../_lib/hostRiegel";
import { begrenztesJson } from "../../_lib/anbindung/koerper";
import { richteEin } from "../../_lib/anbindung/rechner";
import { sitzungAus } from "../../_lib/anbindung/sitzung";
import { bearerAus } from "../../_lib/anbindung/token";
import { einrichtenAnfrage, fehler } from "../../_lib/anbindung/vertrag";

export const dynamic = "force-dynamic";

// 8 KiB: `{art, name}` braucht nie mehr (Tabelle „Schnittstellen", Nr. 3).
const MAX_BODY_BYTES = 8 * 1024;

export async function POST(req: Request) {
  const ab = hostAbweisung(req); if (ab) return ab;
  const db = getDb();
  const jetzt = new Date();
  const s = sitzungAus(db, bearerAus(req), jetzt);
  if (!s) {
    auditDenied("einsatzbuch");
    return fehler(401, "sitzung_ungueltig", "Die Sitzung gilt nicht mehr.");
  }

  const body = await begrenztesJson(req, MAX_BODY_BYTES, "Anfrage ist zu groß"); if (!body.ok) return body.response;
  const parsed = einrichtenAnfrage.safeParse(body.body);
  if (!parsed.success) return fehler(400, "validation_error", parsed.error.message);

  return withAuditContext({ actor: auditActor({ sub: s.sub, name: s.name }) }, async () => {
    const e = await richteEin(db, s, parsed.data, { jetzt });
    if (!e.ok) return fehler(e.status, e.code, e.message, e.extra);
    return Response.json(e.antwort);
  });
}
