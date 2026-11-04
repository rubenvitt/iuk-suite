import { auditActor, auditDenied } from "@/core/audit/server";
import { notFound } from "next/navigation";
import { auth } from "@/core/auth";
import { getModule } from "@/core/registry";
import { isModuleAdmin } from "@/core/groups";

async function darf() { const s = await auth(); return { erlaubt: isModuleAdmin(getModule("uav"), s?.user?.groups ?? null), viewer: s?.user }; }
/** Ohne Sitzung keine Audit-Zeile: das ist der Weg zum Login, keine Abweisung (`auditDenied`, core/audit/server.ts). */
function abgewiesen(viewer: Parameters<typeof auditActor>[0]): void { if (viewer) auditDenied("uav", auditActor(viewer)); }
export async function requireUavAdminPage(): Promise<void> { const z = await darf(); if (!z.erlaubt) { abgewiesen(z.viewer); notFound(); } }
export async function requireUavAdminAction() { const z = await darf(); if (!z.erlaubt) { abgewiesen(z.viewer); throw new Error("Forbidden"); } return z.viewer; }
/** Für Route Handler: NACH hostAbweisung rufen. */
export async function adminAbweisung(): Promise<Response | null> {
  const z = await adminZugang(); return z.ok ? null : z.response;
}

export async function adminZugang() {
  const z = await darf();
  if (z.erlaubt) return { ok: true as const, viewer: z.viewer };
  abgewiesen(z.viewer);
  return { ok: false as const, response: Response.json({ error: { code: "forbidden", message: "Verwaltung nur für Admins" } }, { status: 403 }) };
}
