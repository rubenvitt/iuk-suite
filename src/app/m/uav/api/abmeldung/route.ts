import { NextResponse } from "next/server";
import { getDb } from "../../_db/client";
import { hostAbweisung } from "../../_lib/hostRiegel";
import { sidAusCookieHeader } from "../../_lib/identitaet";
import { SID_COOKIE, sessionLoeschen, sidCookieOptionen } from "../../_lib/sitzung";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const abweisung = hostAbweisung(req); if (abweisung) return abweisung;
  const roh = sidAusCookieHeader(req.headers.get("cookie"));
  if (roh) sessionLoeschen(getDb(), roh);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SID_COOKIE, "", { ...sidCookieOptionen(), maxAge: 0 });
  return res;
}
