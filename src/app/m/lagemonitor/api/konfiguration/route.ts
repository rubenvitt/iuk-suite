/**
 * Der Lagemonitor holt hier seine Einstellungen ab (Repo `lagemonitor`, `src/sources/suite.rs`), jede
 * Minute, mit einem Schlüssel aus der Verwaltung als Bearer. Die Änderungen selbst stehen als
 * Audit-Zeilen von `lagemonitor_anzeige` im Log. Ein Monitor mit GPS meldet dabei seine Position mit
 * (`X-Lagemonitor-Position`, `_lib/fahrzeuge.ts`); eine unlesbare Position wird übergangen, nie abgelehnt.
 */
import { getDb } from "../../_db/client";
import { abholungAbgelehnt } from "../../_lib/ablehnung";
import { alsVehicles, meldePosition, POSITION_KOPF, positionAusKopf } from "../../_lib/fahrzeuge";
import { hostAbweisung } from "../../_lib/host";
import { alsVertrag } from "../../_lib/konfiguration";
import { bearerAus, zugangAusSchluessel } from "../../_lib/schluessel";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ab = hostAbweisung(req); if (ab) return ab;
  const db = getDb();
  const jetzt = new Date();
  const zugangId = zugangAusSchluessel(db, bearerAus(req), jetzt);
  if (!zugangId) {
    abholungAbgelehnt();
    return Response.json({ error: { code: "schluessel_ungueltig", message: "Dieser Schlüssel gilt nicht (mehr)." } }, { status: 401 });
  }
  const position = positionAusKopf(req.headers.get(POSITION_KOPF));
  if (position) meldePosition(db, zugangId, position, jetzt);
  return Response.json(alsVertrag(db, jetzt, alsVehicles(db, zugangId, jetzt)), { headers: { "Cache-Control": "no-store" } });
}
