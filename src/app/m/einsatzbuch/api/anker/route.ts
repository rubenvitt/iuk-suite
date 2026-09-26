/**
 * Schnittstelle 5 der Anbindung: Der Rechner meldet den Hash eines versiegelten Blocks (`POST`).
 * Eine Abweichung landet auditiert in `anker_abweichung` — dafür braucht es den Akteur des Geräts
 * (Plan Stufe 5, Task 3: Handler mit Geräte-Token laufen unter `withAuditContext`).
 *
 * `GET` ist die Gegenrichtung (Stufe 6, Entscheidung 5): Der Rechner holt den höchsten
 * Suite-Anker der Kette, deren Block 1 den Hash `?erster=` trägt — für die Wiederherstellung.
 * Anders als `POST` prüft das nicht gegen eine Meldung, sondern liest den Stand: Ein frisch
 * eingerichteter echter Rechner hat noch keine eigenen Anker, `POST` würde einen unbekannten
 * Block einfach annehmen. Read-only wie `GET stammdaten`, aber ohne `letzter_kontakt`.
 */
import { auditDenied, withAuditContext } from "@/core/audit/server";
import { getDb } from "../../_db/client";
import { hostAbweisung } from "../../_lib/hostRiegel";
import { kettenanker, meldeAnker } from "../../_lib/anbindung/anker";
import { rechnerAusToken } from "../../_lib/anbindung/geraet";
import { begrenztesJson } from "../../_lib/anbindung/koerper";
import { bearerAus } from "../../_lib/anbindung/token";
import { ankerAnfrage, fehler, kettenankerAbfrage } from "../../_lib/anbindung/vertrag";

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

export async function GET(req: Request) {
  const ab = hostAbweisung(req); if (ab) return ab;
  const db = getDb();
  const r = rechnerAusToken(db, bearerAus(req));
  if (!r) {
    auditDenied("einsatzbuch");
    return fehler(401, "geraet_ungueltig", "Das Geräte-Token gilt nicht mehr.");
  }

  const abfrage = kettenankerAbfrage.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!abfrage.success) return fehler(400, "validation_error", abfrage.error.message);

  const ergebnis = kettenanker(db, r, abfrage.data.erster);
  if (!ergebnis.ok) {
    return fehler(409, "anker_mehrdeutig", "Der Kettenanker ist nicht eindeutig: echte Rechner derselben Kette tragen für den höchsten Block verschiedene Hashes.");
  }
  return Response.json({ anker: ergebnis.anker });
}
