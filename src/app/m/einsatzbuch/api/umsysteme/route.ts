/**
 * Der Rechner holt die Einsätze der verbundenen Umsysteme (IDA-359), heute nur Suchlage, mit
 * seinem Geräte-Token. Die Suite fragt Suchlage selbst und reicht nur Name, Ort und Zeiten weiter;
 * das Großbild-Token bleibt hier. Ohne Verbindung ist die Liste leer, der Rechner zeigt dann keine
 * Auswahl. Read-only (Manifest: `excluded`).
 */
import { auditDenied } from "@/core/audit/server";
import { getDb } from "../../_db/client";
import { hostAbweisung } from "../../_lib/hostRiegel";
import { kontakt, rechnerAusToken } from "../../_lib/anbindung/geraet";
import { bearerAus } from "../../_lib/anbindung/token";
import { fehler, type UmsystemeAntwort } from "../../_lib/anbindung/vertrag";
import { suchlageEinsaetze } from "../../_lib/umsysteme";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ab = hostAbweisung(req); if (ab) return ab;
  const db = getDb();
  const r = rechnerAusToken(db, bearerAus(req));
  if (!r) {
    auditDenied("einsatzbuch");
    return fehler(401, "geraet_ungueltig", "Das Geräte-Token gilt nicht mehr.");
  }
  kontakt(db, r.id, new Date());

  const liste = await suchlageEinsaetze(db);
  const headers = { "Cache-Control": "no-store" };
  if (liste.ok) return Response.json({ einsaetze: liste.einsaetze } satisfies UmsystemeAntwort, { headers });
  if (liste.grund === "nicht_verbunden") return Response.json({ einsaetze: [] } satisfies UmsystemeAntwort, { headers });
  if (liste.grund === "abgelehnt") {
    return fehler(502, "umsystem_abgelehnt", "Suchlage lehnt den Großbild-Link der Suite ab. In der Suite unter Einstellungen einen neuen eintragen.");
  }
  return fehler(503, "umsystem_nicht_erreichbar", "Suchlage antwortet gerade nicht.");
}
