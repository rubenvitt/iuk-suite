import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { Session } from "next-auth";
import { auditActor, auditDenied, auditLoginRequired } from "@/core/audit/server";
import { auth } from "@/core/auth";
import { hasAnyGroup, isModuleAdmin } from "@/core/groups";
import { getModule, prodHostsFor, requiredGroupsFor } from "@/core/registry";
import { resolveHost } from "@/core/routing";
import { getDb, type WartungDb } from "../_db/client";
import { gruppe, verwalter } from "../_db/schema";
import { merkePerson } from "./personen";
import { istWartungHost } from "./host";

export type Viewer = Session["user"];
type EnvLike = Record<string, string | undefined>;

/**
 * Wer was darf (Entscheidungen 2026-11-03 an IDA-307 und IDA-337):
 * - Einen Mangel am Gerät melden: jeder mit dem QR-Code, auch ohne Anmeldung (`besucher`, Bremse in
 *   `_lib/bremse.ts`). Deshalb `requiresAuth: false`: Login und Modulzugang riegelt dieses Modul selbst.
 * - Prüfen, Betriebsstunden eintragen, die Geräteliste: der Modulzugang (`wartung-nutzer`, `wartung-admin`).
 * - Den Bestand einer Gruppe pflegen: wen der Admin der Gruppe zugeordnet hat (`verwalter`, je Person der
 *   OIDC-`sub`). Die Zuordnung kommt aus der Modul-Datenbank, nie aus einem URL-Parameter (IDOR).
 * - Alles, auch Gruppen anlegen: Modul-Admins (`SUITE_ADMIN_GROUP_WARTUNG`, Vorgabe `wartung-admin`; der
 *   Suite-Admin zählt nach `isModuleAdmin` mit).
 * Gerätearten und Checklisten sind gemeinsam: pflegen darf sie jeder Verwalter.
 */
export interface Rechte {
  admin: boolean;
  /** Kennungen der Gruppen, die diese Person verwaltet — bei Admins alle. */
  gruppen: string[];
}

/** Modulzugang: die Zugangsgruppen (`SUITE_ACCESS_GROUP_WARTUNG`) oder wer das Modul administriert. */
export function hatWartungZugang(groups: readonly string[] | null | undefined, env: EnvLike = process.env): boolean {
  const mod = getModule("wartung");
  return hasAnyGroup(groups, requiredGroupsFor(mod, env)) || isModuleAdmin(mod, groups ? [...groups] : null, env);
}

export function istWartungAdmin(groups: readonly string[] | null | undefined, env: EnvLike = process.env): boolean {
  return isModuleAdmin(getModule("wartung"), groups ? [...groups] : null, env);
}

/** Die Kennung einer Person für `verwalter.nutzer`: der OIDC-`sub` (dieselbe wie im Audit-Log). */
export function nutzerAus(viewer: { sub?: string | null; id?: string | null } | null | undefined): string | null {
  return viewer?.sub ?? viewer?.id ?? null;
}

export function rechteAus(
  db: WartungDb, groups: readonly string[] | null | undefined, nutzer: string | null, env: EnvLike = process.env,
): Rechte {
  const admin = istWartungAdmin(groups, env);
  if (admin) return { admin, gruppen: db.select({ id: gruppe.id }).from(gruppe).all().map((g) => g.id) };
  if (nutzer === null) return { admin, gruppen: [] };
  return { admin, gruppen: db.select({ id: verwalter.gruppeId }).from(verwalter).where(eq(verwalter.nutzer, nutzer)).all().map((v) => v.id) };
}

export const istVerwalter = (r: Rechte): boolean => r.admin || r.gruppen.length > 0;
export const verwaltetGruppe = (r: Rechte, gruppeId: string): boolean => r.admin || r.gruppen.includes(gruppeId);

/** Riegel für Layout UND jede Seite: Host, Sitzung. Ohne Sitzung → Login. */
/**
 * Wohin nach der Anmeldung: absolut auf den Modul-Host (Vorbild `lagerbuch`, `verwaltungsZiel`). Ein relatives
 * Ziel löste Auth.js gegen den Portal-Host auf, und dort gibt es diesen Pfad nicht.
 */
export function loginZiel(kopf: Headers, pfad: string): string {
  const angefragt = resolveHost(kopf);
  const host = prodHostsFor(getModule("wartung"))[0] ?? (istWartungHost(kopf) ? angefragt.split(":")[0] : undefined);
  if (!host) return `/m/wartung${pfad === "/" ? "" : pfad}`;
  const proto = kopf.get("x-forwarded-proto")?.split(",")[0].trim() || "http";
  const port = angefragt.split(":")[1];
  return `${proto}://${host}${port ? `:${port}` : ""}${pfad}`;
}

/** Wer eine öffentliche Seite (QR) ansieht: Host-Riegel, Sitzung optional; `zugang` sagt, ob mehr geht. */
export async function besucher(): Promise<{ viewer: Viewer | null; zugang: boolean; rechte: Rechte }> {
  if (!istWartungHost(await headers())) notFound();
  const viewer = (await auth())?.user ?? null;
  if (!viewer || !hatWartungZugang(viewer.groups)) return { viewer, zugang: false, rechte: { admin: false, gruppen: [] } };
  return { viewer, zugang: true, rechte: rechteAus(getDb(), viewer.groups, nutzerAus(viewer)) };
}

/**
 * Riegel für Layout UND jede Seite mit Modulzugang: Host, Sitzung, Zugangsgruppe. Ohne Sitzung → Login und
 * zurück nach `pfad`; ohne Zugang → 404 mit Audit-Zeile.
 */
export async function requireZugang(pfad = "/"): Promise<{ viewer: Viewer; rechte: Rechte }> {
  const kopf = await headers();
  if (!istWartungHost(kopf)) notFound();
  const viewer = (await auth())?.user;
  if (!viewer) {
    auditLoginRequired("wartung");
    redirect(`/login?callbackUrl=${encodeURIComponent(loginZiel(kopf, pfad))}`);
  }
  if (!hatWartungZugang(viewer.groups)) {
    auditDenied("wartung", auditActor(viewer));
    notFound();
  }
  const db = getDb();
  const nutzer = nutzerAus(viewer);
  merkePerson(db, nutzer, viewer.name);
  return { viewer, rechte: rechteAus(db, viewer.groups, nutzer) };
}

/** Wie oben, zusätzlich Verwalter einer Gruppe oder Admin; sonst 404 mit Audit-Zeile. */
export async function requireVerwalter(): Promise<{ viewer: Viewer; rechte: Rechte }> {
  const z = await requireZugang();
  if (!istVerwalter(z.rechte)) {
    auditDenied("wartung", auditActor(z.viewer));
    notFound();
  }
  return z;
}

export async function requireAdmin(): Promise<{ viewer: Viewer; rechte: Rechte }> {
  const z = await requireZugang();
  if (!z.rechte.admin) {
    auditDenied("wartung", auditActor(z.viewer));
    notFound();
  }
  return z;
}

export type Stufe = "zugang" | "verwalter" | "admin";

/** Riegel für Server Actions und Route Handler: Host, Sitzung, Modulzugang, Stufe. Wurf statt Umleitung. */
export async function requireAktion(stufe: Stufe): Promise<{ viewer: Viewer; rechte: Rechte }> {
  const kopf = await headers();
  const viewer = (await auth())?.user;
  if (!istWartungHost(kopf)) { auditDenied("wartung", auditActor(viewer)); throw new Error("Forbidden"); }
  if (!viewer) { auditLoginRequired("wartung"); throw new Error("Forbidden"); }
  if (!hatWartungZugang(viewer.groups)) { auditDenied("wartung", auditActor(viewer)); throw new Error("Forbidden"); }
  const rechte = rechteAus(getDb(), viewer.groups, nutzerAus(viewer));
  const darf = stufe === "zugang" || (stufe === "admin" ? rechte.admin : istVerwalter(rechte));
  if (!darf) { auditDenied("wartung", auditActor(viewer)); throw new Error("Forbidden"); }
  return { viewer, rechte };
}

/** Der Name, der im Verlauf steht: Anzeigename aus Pocket ID, sonst die Mailadresse. */
export function anzeigename(viewer: Viewer): string {
  return (viewer.name ?? viewer.email ?? "").trim() || "Unbekannt";
}
