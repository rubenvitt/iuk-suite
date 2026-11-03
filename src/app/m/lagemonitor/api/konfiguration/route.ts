/**
 * Der Lagemonitor holt hier seine Einstellungen ab (Repo `lagemonitor`, `src/sources/suite.rs`), jede
 * Minute, mit einem Schlüssel aus der Verwaltung als Bearer. Die Änderungen selbst stehen als
 * Audit-Zeilen von `lagemonitor_anzeige` im Log. Ein Monitor mit GPS meldet dabei seine Position mit
 * (`X-Lagemonitor-Position`, `_lib/fahrzeuge.ts`); eine unlesbare Position wird übergangen, nie abgelehnt.
 * Mit `If-None-Match` und unveränderten Einstellungen kommt ein 304 ohne Körper (`_lib/etag.ts`); die
 * Position wird vorher trotzdem gemeldet. Jeder Zugang bekommt seinen eigenen Standort (`_lib/standort.ts`).
 */
import { getDb } from "../../_db/client";
import { abholungAbgelehnt } from "../../_lib/ablehnung";
import { alsVehicles, meldePosition, POSITION_KOPF, positionAusKopf } from "../../_lib/fahrzeuge";
import { etagVon, unveraendert } from "../../_lib/etag";
import { hostAbweisung } from "../../_lib/host";
import { alsVertrag } from "../../_lib/konfiguration";
import { festeOrte, standortFuer } from "../../_lib/standort";
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
  const vehicles = [...alsVehicles(db, zugangId, jetzt), ...festeOrte(db, zugangId)];
  const koerper = JSON.stringify(alsVertrag(db, jetzt, vehicles, standortFuer(db, zugangId, jetzt)));
  const etag = etagVon(koerper);
  const kopf = { "Cache-Control": "no-store", ETag: etag };
  if (unveraendert(req.headers.get("if-none-match"), etag)) return new Response(null, { status: 304, headers: kopf });
  return new Response(koerper, { headers: { ...kopf, "Content-Type": "application/json" } });
}
