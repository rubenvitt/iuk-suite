import { auth } from "@/core/auth";
import { getModule } from "@/core/registry";
import { isModuleAdmin } from "@/core/groups";
import type { UavDb } from "../_db/client";
import { SID_COOKIE, sessionValidieren, type Identity } from "./sitzung";

export function sidAusCookieHeader(header: string | null): string | null {
  if (!header) return null;
  for (const teil of header.split(";")) {
    const [k, ...v] = teil.trim().split("=");
    if (k === SID_COOKIE) return decodeURIComponent(v.join("="));
  }
  return null;
}

/** Teilnehmer-Cookie zuerst (kein Netz, kein SSO); dann Suite-Session für Admins. */
export async function identitaetAus(req: Request, db: UavDb): Promise<Identity> {
  const roh = sidAusCookieHeader(req.headers.get("cookie"));
  if (roh) { const t = sessionValidieren(db, roh); if (t) return t; }
  const session = await auth();
  const groups = session?.user?.groups ?? null;
  if (session?.user && isModuleAdmin(getModule("uav"), groups)) {
    return { kind: "admin", id: session.user.id ?? "", name: session.user.name ?? null, email: session.user.email ?? null };
  }
  return { kind: "anon" };
}
