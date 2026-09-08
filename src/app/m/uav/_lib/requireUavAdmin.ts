import { auditActor, auditDenied } from "@/core/audit/server";
import { notFound } from "next/navigation";
import { auth } from "@/core/auth";
import { getModule } from "@/core/registry";
import { isModuleAdmin } from "@/core/groups";

async function darf() { const s = await auth(); return { erlaubt: isModuleAdmin(getModule("uav"), s?.user?.groups ?? null), viewer: s?.user }; }
export async function requireUavAdminPage(): Promise<void> { const z = await darf(); if (!z.erlaubt) { auditDenied("uav", auditActor(z.viewer)); notFound(); } }
export async function requireUavAdminAction() { const z = await darf(); if (!z.erlaubt) { auditDenied("uav", auditActor(z.viewer)); throw new Error("Forbidden"); } return z.viewer; }
/** Für Route Handler: NACH hostAbweisung rufen. */
export async function adminAbweisung(): Promise<Response | null> {
  const z = await adminZugang(); return z.ok ? null : z.response;
}

export async function adminZugang() {
  const z = await darf();
  if (z.erlaubt) return { ok: true as const, viewer: z.viewer };
  auditDenied("uav", auditActor(z.viewer));
  return { ok: false as const, response: Response.json({ error: { code: "forbidden", message: "Verwaltung nur für Admins" } }, { status: 403 }) };
}
