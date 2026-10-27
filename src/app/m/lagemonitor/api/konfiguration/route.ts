/**
 * Der Lagemonitor holt hier seine Einstellungen ab (Repo `lagemonitor`, `src/sources/suite.rs`), jede
 * Minute, mit einem Schlüssel aus der Verwaltung als Bearer. Read-only; die Änderungen selbst stehen
 * als Audit-Zeilen von `lagemonitor_anzeige` im Log.
 */
import { auditDenied } from "@/core/audit/server";
import { getDb } from "../../_db/client";
import { hostAbweisung } from "../../_lib/host";
import { alsVertrag } from "../../_lib/konfiguration";
import { bearerAus, zugangAusSchluessel } from "../../_lib/schluessel";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ab = hostAbweisung(req); if (ab) return ab;
  const db = getDb();
  if (!zugangAusSchluessel(db, bearerAus(req))) {
    auditDenied("lagemonitor");
    return Response.json({ error: { code: "schluessel_ungueltig", message: "Dieser Schlüssel gilt nicht (mehr)." } }, { status: 401 });
  }
  return Response.json(alsVertrag(db), { headers: { "Cache-Control": "no-store" } });
}
