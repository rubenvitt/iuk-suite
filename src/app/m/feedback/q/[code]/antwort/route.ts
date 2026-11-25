// EINE ANTWORT (Handy). Maßgeblich ist die Serverzeit: nach Ablauf von `zeit_s` oder nach der
// Auflösung ist die Frage zu (409 `geschlossen`, Review Focus 4).
import { withAuditContext } from "@/core/audit/server";
import { clientIpAus } from "@/core/ratelimit";
import { getDb } from "@/app/m/feedback/_db/client";
import {
  antworte,
  offeneRundePerCode,
  teilnahmePerToken,
} from "@/app/m/feedback/_db/quiz";
import { tokenHash } from "@/app/m/feedback/_lib/quiz/codes";
import { antwortGrenze, beitrittGrenze } from "@/app/m/feedback/_lib/quiz/grenzen";
import {
  CODE_MAX,
  cookieWert,
  fehler,
  istObjekt,
  json,
  leseJson,
  nurSchluessel,
  quizCookie,
} from "@/app/m/feedback/_lib/quiz/http";
import { holeAutoEndeNach, meldeRunde } from "@/app/m/feedback/_lib/quiz/stand";

/** Eine Frage hat höchstens sechs Optionen (`_lib/quiz/fragen.ts`). */
const AUSWAHL_MAX = 6;

function eingabe(
  wert: unknown,
): { frageIndex: number; gewaehlt: number[] } | null {
  if (!istObjekt(wert) || !nurSchluessel(wert, ["frageIndex", "gewaehlt"]))
    return null;
  const { frageIndex, gewaehlt } = wert;
  if (
    typeof frageIndex !== "number" ||
    !Number.isInteger(frageIndex) ||
    frageIndex < 0
  )
    return null;
  if (
    !Array.isArray(gewaehlt) ||
    gewaehlt.length === 0 ||
    gewaehlt.length > AUSWAHL_MAX
  )
    return null;
  if (
    !gewaehlt.every(
      (i): i is number =>
        typeof i === "number" && Number.isInteger(i) && i >= 0,
    )
  )
    return null;
  return { frageIndex, gewaehlt };
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const body = await leseJson(req);
  const e = body.ok ? eingabe(body.wert) : null;
  if (!e) return fehler(400, "ungueltig");

  return withAuditContext({ actor: { kind: "anonymous" } }, async () => {
    const db = getDb();
    const jetzt = new Date();
    holeAutoEndeNach(db, jetzt);
    const runde =
      code.length <= CODE_MAX ? offeneRundePerCode(db, code, jetzt) : undefined;
    if (!runde) {
      // Wie beim Beitritt: ein Fehlgriff zählt gegen die Adresse (kein Code-Orakel).
      return beitrittGrenze.check(clientIpAus(req.headers))
        ? fehler(404, "unbekannt")
        : fehler(429, "zu_viele");
    }
    const token = cookieWert(req, quizCookie(runde.id));
    if (!token) return fehler(401, "keine_teilnahme");
    if (!antwortGrenze.check(tokenHash(token))) return fehler(429, "zu_viele");
    const teilnahmeId = teilnahmePerToken(db, runde.id, token);
    if (teilnahmeId === null) return fehler(401, "keine_teilnahme");

    const ergebnis = antworte(
      db,
      runde,
      teilnahmeId,
      e.frageIndex,
      e.gewaehlt,
      jetzt,
    );
    if (ergebnis === "ok") {
      meldeRunde(runde);
      return json({ ok: true });
    }
    return ergebnis === "ungueltig"
      ? fehler(400, "ungueltig")
      : fehler(409, ergebnis);
  });
}
