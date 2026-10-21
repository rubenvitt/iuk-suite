import { notFound } from "next/navigation";
import { auth } from "@/core/auth";
import { suiteAdminGroup } from "@/core/groups";
import { auditActor, auditDenied } from "@/core/audit/server";

/**
 * Wer Rechte vergibt: nur die Suite-Betriebsgruppe (`ADMIN_GROUP`) — dasselbe Prädikat wie das Audit-Log
 * (`core/audit/access`), und bewusst NICHT `isModuleAdmin("portal")`: eine per `SUITE_ADMIN_GROUP_PORTAL`
 * benannte Portal-Gruppe pflegt Kacheln, sie vergibt keine Rechte für die ganze Suite.
 */
async function sitzung() {
  const session = await auth();
  const darf = session?.user?.groups?.includes(suiteAdminGroup()) === true;
  return { darf, user: session?.user };
}

/** Sichtbarkeit des Einstiegs auf der Verwaltungsseite. Wirft nicht. */
export async function darfRechteVergeben(): Promise<boolean> {
  return (await sitzung()).darf;
}

/** Für die Seite: 404 statt 403, wie jeder Verwaltungsriegel der Suite. */
export async function rechteSeiteOderNotFound(): Promise<{ id: string }> {
  const { darf, user } = await sitzung();
  if (!darf || !user?.id) {
    auditDenied("portal", auditActor(user), "rechte");
    notFound();
  }
  return { id: user.id };
}

/** Für die Action: bricht ab, bevor irgendetwas in Pocket ID geschrieben wird. */
export async function requireRechteVerwalter(): Promise<{ id: string; name?: string | null }> {
  const { darf, user } = await sitzung();
  if (!darf || !user?.id) {
    auditDenied("portal", auditActor(user), "rechte");
    throw new Error("Forbidden");
  }
  return { id: user.id, name: user.name };
}
