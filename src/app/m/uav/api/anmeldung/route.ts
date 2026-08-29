import { NextResponse } from "next/server";
import { z } from "zod";
import { RateLimiter } from "@/core/ratelimit";
import { getDb } from "../../_db/client";
import { hostAbweisung } from "../../_lib/hostRiegel";
import { codeNormalisieren } from "../../_lib/code";
import { teilnehmerGesehen, teilnehmerPerCode } from "../../_lib/queries";
import { SID_COOKIE, sessionErzeugen, sidCookieOptionen } from "../../_lib/sitzung";

export const dynamic = "force-dynamic";
const schema = z.object({ code: z.string().min(1) });
// Pro Code, nicht pro IP (Spec §4). Prozessspeicher — Notbremse, kein Budget.
const limiter = new RateLimiter({ windowMs: 60_000, max: 10 });

const fehler = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status });

export async function POST(req: Request) {
  const abweisung = hostAbweisung(req); if (abweisung) return abweisung;
  let body: unknown; try { body = await req.json(); } catch { return fehler(400, "invalid_json", "Ungültiger JSON-Body"); }
  const parsed = schema.safeParse(body); if (!parsed.success) return fehler(400, "validation_error", "code fehlt");
  const code = codeNormalisieren(parsed.data.code);
  if (!limiter.check(code)) return fehler(429, "rate_limited", "Zu viele Versuche. Bitte später erneut versuchen.");
  const db = getDb();
  const t = code ? teilnehmerPerCode(db, code) : null;
  if (!t) return fehler(401, "invalid_code", "Ungültiger oder inaktiver Code.");
  teilnehmerGesehen(db, t.id);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SID_COOKIE, sessionErzeugen(db, t.id), sidCookieOptionen());
  return res;
}
