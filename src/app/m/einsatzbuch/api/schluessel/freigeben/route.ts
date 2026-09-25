/**
 * Schnittstelle 7 der Anbindung: Die Verwaltung fragt die CEKs freigegebener Blöcke an. `gibFrei`
 * entscheidet die Obergrenze (`HOECHSTENS_FREIGABEN`, 413 `zu_viele`) selbst — das Anfrageschema
 * hat deshalb bewusst kein `.max(200)`. Die Körpergrenze hier (256 KiB) ist eine
 * zweite, unabhängige Bremse: Ein RIESIGES Array wird nie ganz geparst, ganz gleich, wie die
 * Anzahl der Einträge am Ende ausfällt.
 */
import { auditActor, auditDenied, withAuditContext } from "@/core/audit/server";
import { getDb } from "../../../_db/client";
import { hostAbweisung } from "../../../_lib/hostRiegel";
import { gibFrei } from "../../../_lib/anbindung/freigabe";
import { begrenztesJson } from "../../../_lib/anbindung/koerper";
import { sitzungAus } from "../../../_lib/anbindung/sitzung";
import { bearerAus } from "../../../_lib/anbindung/token";
import { fehler, freigabeAnfrage } from "../../../_lib/anbindung/vertrag";

export const dynamic = "force-dynamic";

// 256 KiB (Plan Stufe 5, Task 3): `freigabeAnfrage` begrenzt die Anzahl nicht selbst.
const MAX_BODY_BYTES = 256 * 1024;

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
  const parsed = freigabeAnfrage.safeParse(body.body);
  if (!parsed.success) return fehler(400, "validation_error", parsed.error.message);

  return withAuditContext({ actor: auditActor({ sub: s.sub, name: s.name }) }, async () => {
    const ergebnis = await gibFrei(db, s, parsed.data, { jetzt });
    if (!ergebnis.ok) return fehler(ergebnis.status, ergebnis.code, ergebnis.message);
    return Response.json(ergebnis.schluessel);
  });
}
