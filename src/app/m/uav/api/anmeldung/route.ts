import { withAuditContext, auditParticipantActor, auditEvent } from "@/core/audit/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { clientIpAus } from "@/core/ratelimit";
import { getDb } from "../../_db/client";
import { hostAbweisung } from "../../_lib/hostRiegel";
import { ablehnungProtokollieren, codeVersuchErlaubt, fehlversuchBuchen } from "../../_lib/anmeldeSchranke";
import { begrenztesJson } from "../../_lib/begrenztesJson";
import { CODE_ROH_MAX_ZEICHEN, codeFormatGueltig, codeNormalisieren } from "../../_lib/code";
import { teilnehmerGesehen, teilnehmerPerCode } from "../../_lib/queries";
import { SID_COOKIE, sessionErzeugen, sidCookieOptionen } from "../../_lib/sitzung";

export const dynamic = "force-dynamic";
// Der Body trägt nur `{"code":"…"}` mit höchstens `CODE_ROH_MAX_ZEICHEN` Zeichen — ein KiB
// lässt reichlich Luft für Escapes und Leerraum und liest nie mehr in den Speicher (DRK-447).
export const ANMELDUNG_MAX_BODY_BYTES = 1024;
// Rohwert klein begrenzen, BEVOR normalisiert und gezählt wird (DRK-287).
const schema = z.object({ code: z.string().min(1).max(CODE_ROH_MAX_ZEICHEN) });

const fehler = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status });
const zuVieleVersuche = () => fehler(429, "rate_limited", "Zu viele Versuche. Bitte später erneut versuchen.");

export async function POST(req: Request) {
  const abweisung = hostAbweisung(req); if (abweisung) return abweisung;
  const body = await begrenztesJson(req, ANMELDUNG_MAX_BODY_BYTES, "Anmelde-Body ist zu groß"); if (!body.ok) return body.response;
  const parsed = schema.safeParse(body.body); if (!parsed.success) return fehler(400, "validation_error", "code fehlt oder ist zu lang");
  // Zwei Zähler, je Code und je Absender — Begründung in `_lib/anmeldeSchranke.ts`.
  const absender = clientIpAus(req.headers);
  const code = codeNormalisieren(parsed.data.code);
  const abgelehnt = () => { fehlversuchBuchen(absender); ablehnungProtokollieren(); return fehler(401, "invalid_code", "Ungültiger oder inaktiver Code."); };
  if (!codeFormatGueltig(code)) return abgelehnt();
  if (!codeVersuchErlaubt(code, absender)) return zuVieleVersuche();
  const db = getDb();
  const t = teilnehmerPerCode(db, code);
  if (!t) return abgelehnt();
  return withAuditContext({ actor: { kind: "anonymous" } }, async () => {
    teilnehmerGesehen(db, t.id);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SID_COOKIE, sessionErzeugen(db, t.id), sidCookieOptionen());
    auditEvent({ module: "uav", action: "sign_in", objectType: "session", result: "success", origin: "server" }, auditParticipantActor(t.id));
    return res;
  });
}
