/**
 * Schnittstelle 2 der Anbindung (Tabelle „Schnittstellen"): Die App tauscht den Einmalcode aus
 * der Anmeldung gegen eine Verwaltungssitzung. Die Sitzung selbst ist technisch (Manifest:
 * `explicit-only`) — eine Anmeldung wird als Ereignis vermerkt, jede spätere Schlüsselfreigabe
 * trägt ihr eigenes Audit (`freigabe`).
 */
import { auditActor, auditEvent } from "@/core/audit/server";
import { RateLimiter, clientIpAus } from "@/core/ratelimit";
import { getDb } from "../../../_db/client";
import { hostAbweisung } from "../../../_lib/hostRiegel";
import { rechnerAusToken } from "../../../_lib/anbindung/geraet";
import { begrenztesJson } from "../../../_lib/anbindung/koerper";
import { raeumeAnbindungAuf } from "../../../_lib/anbindung/aufraeumen";
import { loeseEin } from "../../../_lib/anbindung/einmalcode";
import { erzeugeSitzung } from "../../../_lib/anbindung/sitzung";
import { zeitpunktInZone } from "../../../_lib/anbindung/stammdatenpaket";
import { bearerAus } from "../../../_lib/anbindung/token";
import { fehler, tauschAnfrage, type TauschAntwort } from "../../../_lib/anbindung/vertrag";

export const dynamic = "force-dynamic";

// 8 KiB: `{code, verifier}` braucht nie mehr (Tabelle „Schnittstellen", Nr. 2).
const MAX_BODY_BYTES = 8 * 1024;
// Spec §12 (Entscheidung 17): 10 Tausche je Minute und Absenderadresse.
const begrenzer = new RateLimiter({ windowMs: 60_000, max: 10 });

export async function POST(req: Request) {
  const ab = hostAbweisung(req); if (ab) return ab;
  // Ratenbremse zuerst, dann der Code (Plan Stufe 5, Task 3): ein Angreifer mit vielen Codes verbraucht
  // sein Budget, bevor auch nur ein Code geprüft wird.
  if (!begrenzer.check(clientIpAus(req.headers))) return fehler(429, "rate_limited", "Zu viele Versuche. Bitte später erneut versuchen.");

  const body = await begrenztesJson(req, MAX_BODY_BYTES, "Anfrage ist zu groß"); if (!body.ok) return body.response;
  const parsed = tauschAnfrage.safeParse(body.body);
  if (!parsed.success) return fehler(400, "validation_error", parsed.error.message);

  const db = getDb();
  const jetzt = new Date();
  // Aufräumen bei Zugriff (Entscheidung 10, `_lib/anbindung/aufraeumen.ts`): abgelaufene Codes
  // und Sitzungen verschwinden, ohne auf den Zehn-Minuten-Takt zu warten.
  raeumeAnbindungAuf(db, jetzt);
  const eingeloest = loeseEin(db, parsed.data.code, parsed.data.verifier, jetzt);
  if (!eingeloest.ok) {
    const message = eingeloest.code === "verifier_falsch" ? "Der Verifier passt nicht zum Code." : "Der Code ist unbekannt, abgelaufen oder schon eingelöst.";
    return fehler(400, eingeloest.code, message);
  }

  // Optionales Geräte-Token (Entscheidung 2): widerrufen oder unbekannt bindet die Sitzung an
  // keinen Rechner — sie kann noch einrichten, aber nichts freigeben.
  const rechner = rechnerAusToken(db, bearerAus(req));
  const { token, ablauf } = erzeugeSitzung(db, {
    sub: eingeloest.sub, name: eingeloest.name, rechnerId: rechner?.id ?? null,
    einrichtung: eingeloest.einrichtung, jetzt,
  });

  auditEvent(
    { module: "einsatzbuch", action: "sign_in", objectType: "session", result: "success", origin: "server" },
    auditActor({ sub: eingeloest.sub, name: eingeloest.name }),
  );

  const antwort: TauschAntwort = {
    sitzungstoken: token, name: eingeloest.name, ablauf: zeitpunktInZone(ablauf),
    rechnerId: rechner?.id ?? null, einrichtung: eingeloest.einrichtung,
  };
  return Response.json(antwort);
}
