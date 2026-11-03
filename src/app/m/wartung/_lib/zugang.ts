import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { Session } from "next-auth";
import { auditActor, auditDenied, auditLoginRequired } from "@/core/audit/server";
import { auth } from "@/core/auth";
import { isModuleAdmin } from "@/core/groups";
import { getModule } from "@/core/registry";
import { getDb, type WartungDb } from "../_db/client";
import { gruppe } from "../_db/schema";
import { istWartungHost } from "./host";

export type Viewer = Session["user"];
type EnvLike = Record<string, string | undefined>;

/**
 * Wer was darf (Entscheidung 2026-11-03 an IDA-307):
 * - Prüfen, Betriebsstunden eintragen und Mängel melden: jeder Angemeldete (die Middleware riegelt den Login).
 * - Den Bestand einer Gruppe pflegen: wer in deren Pocket-ID-Gruppe ist (`gruppe.pocket_gruppe`). Die Zuordnung
 *   kommt aus der Modul-Datenbank, nie aus einem URL-Parameter (IDOR).
 * - Alles, auch Gruppen anlegen: Modul-Admins (`SUITE_ADMIN_GROUP_WARTUNG`, Vorgabe `wartung-admin`; der
 *   Suite-Admin zählt nach `isModuleAdmin` mit).
 * Gerätearten und Checklisten sind gemeinsam: pflegen darf sie jeder Verwalter.
 */
export interface Rechte {
  admin: boolean;
  /** Kennungen der Gruppen, die diese Person verwaltet — bei Admins alle. */
  gruppen: string[];
}

export function istWartungAdmin(groups: readonly string[] | null | undefined, env: EnvLike = process.env): boolean {
  return isModuleAdmin(getModule("wartung"), groups ? [...groups] : null, env);
}

export function rechteAus(db: WartungDb, groups: readonly string[] | null | undefined, env: EnvLike = process.env): Rechte {
  const admin = istWartungAdmin(groups, env);
  const alle = db.select({ id: gruppe.id, pocket: gruppe.pocketGruppe }).from(gruppe).all();
  const eigene = groups ?? [];
  return { admin, gruppen: alle.filter((g) => admin || eigene.includes(g.pocket)).map((g) => g.id) };
}

export const istVerwalter = (r: Rechte): boolean => r.admin || r.gruppen.length > 0;
export const verwaltetGruppe = (r: Rechte, gruppeId: string): boolean => r.admin || r.gruppen.includes(gruppeId);

/** Riegel für Layout UND jede Seite: Host, Sitzung. Ohne Sitzung → Login. */
export async function requireAngemeldet(): Promise<{ viewer: Viewer; rechte: Rechte }> {
  if (!istWartungHost(await headers())) notFound();
  const viewer = (await auth())?.user;
  if (!viewer) {
    auditLoginRequired("wartung");
    redirect(`/login?callbackUrl=${encodeURIComponent("/m/wartung")}`);
  }
  return { viewer, rechte: rechteAus(getDb(), viewer.groups) };
}

/** Wie oben, zusätzlich Verwalter einer Gruppe oder Admin; sonst 404 mit Audit-Zeile. */
export async function requireVerwalter(): Promise<{ viewer: Viewer; rechte: Rechte }> {
  const z = await requireAngemeldet();
  if (!istVerwalter(z.rechte)) {
    auditDenied("wartung", auditActor(z.viewer));
    notFound();
  }
  return z;
}

export async function requireAdmin(): Promise<{ viewer: Viewer; rechte: Rechte }> {
  const z = await requireAngemeldet();
  if (!z.rechte.admin) {
    auditDenied("wartung", auditActor(z.viewer));
    notFound();
  }
  return z;
}

export type Stufe = "angemeldet" | "verwalter" | "admin";

/** Riegel für Server Actions und Route Handler: Host, Sitzung, Stufe. Wurf statt Umleitung. */
export async function requireAktion(stufe: Stufe): Promise<{ viewer: Viewer; rechte: Rechte }> {
  const kopf = await headers();
  const viewer = (await auth())?.user;
  if (!istWartungHost(kopf)) { auditDenied("wartung", auditActor(viewer)); throw new Error("Forbidden"); }
  if (!viewer) { auditLoginRequired("wartung"); throw new Error("Forbidden"); }
  const rechte = rechteAus(getDb(), viewer.groups);
  const darf = stufe === "angemeldet" || (stufe === "admin" ? rechte.admin : istVerwalter(rechte));
  if (!darf) { auditDenied("wartung", auditActor(viewer)); throw new Error("Forbidden"); }
  return { viewer, rechte };
}

/** Der Name, der im Verlauf steht: Anzeigename aus Pocket ID, sonst die Mailadresse. */
export function anzeigename(viewer: Viewer): string {
  return (viewer.name ?? viewer.email ?? "").trim() || "Unbekannt";
}
