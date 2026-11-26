// BEITRITT ZUR RUNDE (Handy). Öffentlich, ohne Anmeldung: der Beitrittscode ist der Zugang (§5.6).
// Ein gültiges Cookie dieser Runde heißt „schon dabei" — kein zweiter Beitritt (Review Focus 2).
import { NextResponse } from "next/server";
import { withAuditContext } from "@/core/audit/server";
import { clientIpAus } from "@/core/ratelimit";
import { getDb } from "@/app/m/feedback/_db/client";
import {
  offeneRundePerCode,
  teilnahmePerToken,
  tritteBei,
} from "@/app/m/feedback/_db/quiz";
import { neuesToken } from "@/app/m/feedback/_lib/quiz/codes";
import { beitrittGrenze } from "@/app/m/feedback/_lib/quiz/grenzen";
import {
  CODE_MAX,
  cookieWert,
  fehler,
  istObjekt,
  json,
  leseJson,
  nurSchluessel,
  quizCookie,
  quizCookieOptionen,
} from "@/app/m/feedback/_lib/quiz/http";
import { holeAutoEndeNach, meldeRunde } from "@/app/m/feedback/_lib/quiz/stand";

/** Rohwert vor dem Kürzen auf 20 Zeichen (`_db/quiz.ts`): mehr ist kein Spitzname, sondern Last. */
const SPITZNAME_ROH_MAX = 100;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const body = await leseJson(req);
  if (!body.ok) return fehler(400, "ungueltig");
  const wert = body.wert ?? {};
  if (!istObjekt(wert) || !nurSchluessel(wert, ["spitzname"]))
    return fehler(400, "ungueltig");
  const roh = wert.spitzname;
  if (
    roh !== undefined &&
    roh !== null &&
    (typeof roh !== "string" || roh.length > SPITZNAME_ROH_MAX)
  ) {
    return fehler(400, "ungueltig");
  }

  return withAuditContext({ actor: { kind: "anonymous" } }, async () => {
    const db = getDb();
    const jetzt = new Date();
    const absender = clientIpAus(req.headers);
    holeAutoEndeNach(db, jetzt);
    const runde =
      code.length <= CODE_MAX ? offeneRundePerCode(db, code) : undefined;
    if (!runde) {
      // Ein Fehlgriff zählt mit: so bremst die Grenze auch das Durchprobieren von Codes.
      return beitrittGrenze.check(absender)
        ? fehler(404, "unbekannt")
        : fehler(429, "zu_viele");
    }

    const vorhanden = cookieWert(req, quizCookie(runde.id));
    if (vorhanden && teilnahmePerToken(db, runde.id, vorhanden) !== null)
      return json({ ok: true });

    if (!beitrittGrenze.check(absender)) return fehler(429, "zu_viele");
    const token = neuesToken();
    const ergebnis = tritteBei(db, runde, {
      token,
      spitzname: typeof roh === "string" ? roh : null,
    });
    if ("fehler" in ergebnis) {
      if (ergebnis.fehler === "beendet") return fehler(404, "beendet");
      // Obergrenze der Runde erreicht (`MAX_TEILNAHMEN_JE_RUNDE`).
      if (ergebnis.fehler === "voll") return fehler(409, "voll");
      return fehler(400, ergebnis.fehler);
    }
    meldeRunde(runde);
    const res = NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
    res.cookies.set(quizCookie(runde.id), token, quizCookieOptionen());
    return res;
  });
}
