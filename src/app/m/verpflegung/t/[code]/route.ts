import { NextResponse } from "next/server";
import { auditAccessActor, auditDenied, auditEvent } from "@/core/audit/server";
import { helferCookieAttribute } from "@/core/helferlink/sitzung";
import { getDb } from "../../_db/client";
import { HELFER_COOKIE, loeseEin } from "../../_lib/helfer";
import { hostAbweisung } from "../../_lib/host";

export const dynamic = "force-dynamic";

/**
 * Der Helfer-Link `/t/<code>`: löst den Code ein, setzt die Sitzung und schickt aufs Telefon. Ein ungültiger,
 * gesperrter oder abgelaufener Code landet ohne Unterschied auf `/h?grund=link`. Kein Fehlversuchszähler wie im
 * Lagerbuch: der Code hat 28 Zeichen aus 32 (140 Bit) und wird nicht abgetippt, sondern gescannt oder geöffnet.
 * `Location` relativ (303), damit der Host bleibt, den der Browser kennt.
 */
export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const ab = hostAbweisung(req);
  if (ab) return ab;
  const { code } = await ctx.params;
  const r = await loeseEin(getDb(), code, Date.now());
  if (!r) {
    auditDenied("verpflegung");
    return new NextResponse(null, { status: 303, headers: { Location: "/h?grund=link" } });
  }
  const antw = new NextResponse(null, { status: 303, headers: { Location: "/h" } });
  antw.cookies.set(HELFER_COOKIE, r.wert, helferCookieAttribute(r.sekunden));
  auditEvent({ module: "verpflegung", action: "sign_in", objectType: "session", result: "success", origin: "server" }, auditAccessActor("verpflegung", r.link.id));
  return antw;
}
