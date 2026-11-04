import { NextResponse } from "next/server";
import { auditAccessActor, auditEvent } from "@/core/audit/server";
import { helferCookieAttribute, pruefeHelferSitzung } from "@/core/helferlink/sitzung";
import { HELFER_COOKIE, helferGeheimnis } from "../_lib/helfer";
import { hostAbweisung } from "../_lib/host";

export const dynamic = "force-dynamic";

/** „Beenden“ am Telefon: räumt das Cookie des Helfer-Links. Eine Server Component kann das nicht. */
export async function GET(req: Request) {
  const ab = hostAbweisung(req);
  if (ab) return ab;
  const wert = req.headers.get("cookie")?.split(";").map((v) => v.trim()).find((v) => v.startsWith(`${HELFER_COOKIE}=`))?.slice(HELFER_COOKIE.length + 1);
  let tokenId: string | null = null;
  try { tokenId = wert ? (await pruefeHelferSitzung(helferGeheimnis(), wert))?.tokenId ?? null : null; } catch { tokenId = null; }
  const antw = new NextResponse(null, { status: 303, headers: { Location: "/h?grund=beendet" } });
  antw.cookies.set(HELFER_COOKIE, "", helferCookieAttribute(0));
  if (tokenId) auditEvent({ module: "verpflegung", action: "sign_out", objectType: "session", result: "success", origin: "server" }, auditAccessActor("verpflegung", tokenId));
  return antw;
}
