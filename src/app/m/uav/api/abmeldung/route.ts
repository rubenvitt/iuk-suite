import { auditParticipantActor, auditEvent } from "@/core/audit/server";
import { NextResponse } from "next/server";
import { getDb } from "../../_db/client";
import { hostAbweisung } from "../../_lib/hostRiegel";
import { sidAusCookieHeader } from "../../_lib/identitaet";
import { SID_COOKIE, sessionValidieren, sessionLoeschen, sidCookieOptionen } from "../../_lib/sitzung";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const abweisung = hostAbweisung(req); if (abweisung) return abweisung;
  const roh = sidAusCookieHeader(req.headers.get("cookie"));
  let participant;
  try { participant = roh ? sessionValidieren(getDb(), roh) : null; } catch { /* Logout still clears the cookie. */ }
  if (roh) sessionLoeschen(getDb(), roh);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SID_COOKIE, "", { ...sidCookieOptionen(), maxAge: 0 });
  auditEvent({ module: "uav", action: "sign_out", objectType: "session", result: "success", origin: "server" }, participant?.kind === "participant" ? auditParticipantActor(participant.id) : { kind: "anonymous" });
  return res;
}
