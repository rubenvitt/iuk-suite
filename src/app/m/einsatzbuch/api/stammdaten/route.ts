/**
 * Schnittstelle 4 der Anbindung: Der Rechner holt das Stammdatenpaket mit seinem Geräte-Token.
 * Read-only (Manifest: `excluded`) — die Änderungen an den Stammdaten selbst stehen bereits als
 * Audit-Zeilen der jeweiligen Tabelle im Log (Tabelle „Schnittstellen", Nr. 4).
 */
import { auditDenied } from "@/core/audit/server";
import { getDb } from "../../_db/client";
import { hostAbweisung } from "../../_lib/hostRiegel";
import { kontakt, rechnerAusToken } from "../../_lib/anbindung/geraet";
import { baueStammdatenpaket, etagVon, pruefeLesergrenzen } from "../../_lib/anbindung/stammdatenpaket";
import { bearerAus } from "../../_lib/anbindung/token";
import { fehler } from "../../_lib/anbindung/vertrag";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ab = hostAbweisung(req); if (ab) return ab;
  const db = getDb();
  const r = rechnerAusToken(db, bearerAus(req));
  if (!r) {
    auditDenied("einsatzbuch");
    return fehler(401, "geraet_ungueltig", "Das Geräte-Token gilt nicht mehr.");
  }
  // Beide Ausgänge (200 und 304) zählen als Kontakt (Tabelle „Schnittstellen", Nr. 4).
  kontakt(db, r.id, new Date());

  const paket = baueStammdatenpaket(db);
  const grenze = pruefeLesergrenzen(paket);
  if (!grenze.ok) {
    return fehler(
      422, "stammdaten_zu_lang",
      `${grenze.feld} bei „${grenze.eintrag}“ ist ${grenze.laenge} Zeichen lang, der Reader erlaubt höchstens ${grenze.hoechstens}.`,
      { feld: grenze.feld, eintrag: grenze.eintrag },
    );
  }

  const etag = etagVon(paket);
  const headers = { ETag: etag, "Cache-Control": "no-store" };
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  return Response.json(paket, { headers });
}
