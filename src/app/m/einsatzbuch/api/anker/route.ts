/**
 * Schnittstelle 5 der Anbindung: Der Rechner meldet den Hash eines versiegelten Blocks. Eine
 * Abweichung landet auditiert in `anker_abweichung` — dafür braucht es den Akteur des Geräts
 * (Plan Stufe 5, Task 3: Handler mit Geräte-Token laufen unter `withAuditContext`).
 */
import { auditDenied, withAuditContext } from "@/core/audit/server";
import { getDb } from "../../_db/client";
import { hostAbweisung } from "../../_lib/hostRiegel";
import { meldeAnker } from "../../_lib/anbindung/anker";
import { rechnerAusToken } from "../../_lib/anbindung/geraet";
import { begrenztesJson } from "../../_lib/anbindung/koerper";
import { bearerAus } from "../../_lib/anbindung/token";
import { ankerAnfrage, fehler } from "../../_lib/anbindung/vertrag";

export const dynamic = "force-dynamic";

// 8 KiB: `{block, hash}` braucht nie mehr (Tabelle „Schnittstellen", Nr. 5).
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
  const parsed = ankerAnfrage.safeParse(body.body);
  if (!parsed.success) return fehler(400, "validation_error", parsed.error.message);

  return withAuditContext({ actor: { kind: "access", id: `einsatzbuch:rechner:${r.id}`, name: r.name } }, () => {
    const ergebnis = meldeAnker(db, r.id, parsed.data.block, parsed.data.hash, new Date());
    if (!ergebnis.ok) return fehler(409, "anker_abweichung", "Der gemeldete Hash weicht vom bekannten Anker ab.", { erwartet: ergebnis.erwartet });
    return new Response(null, { status: 204 });
  });
}
