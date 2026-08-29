import { notFound } from "next/navigation";
import { auth } from "@/core/auth";
import { getModule } from "@/core/registry";
import { isModuleAdmin } from "@/core/groups";

async function darf(): Promise<boolean> { const s = await auth(); return isModuleAdmin(getModule("uav"), s?.user?.groups ?? null); }
export async function requireUavAdminPage(): Promise<void> { if (!(await darf())) notFound(); }
export async function requireUavAdminAction(): Promise<void> { if (!(await darf())) throw new Error("Forbidden"); }
/** Für Route Handler: NACH hostAbweisung rufen. */
export async function adminAbweisung(): Promise<Response | null> {
  return (await darf()) ? null : Response.json({ error: { code: "forbidden", message: "Verwaltung nur für Admins" } }, { status: 403 });
}
