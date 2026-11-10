import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { Session } from "next-auth";
import { auditAccessActor, auditActor, auditDenied } from "@/core/audit/server";
import { auth } from "@/core/auth";
import { hasAnyGroup, isModuleAdmin } from "@/core/groups";
import { getModule, prodHostsFor, requiredGroupsFor } from "@/core/registry";
import { resolveHost } from "@/core/routing";
import { getDb } from "../_db/client";
import { HELFER_COOKIE, linkAusCookie } from "./helfer";
import { istVerpflegungHost } from "./host";

export type Viewer = Session["user"];
type EnvLike = Record<string, string | undefined>;

/**
 * Wer was darf (Entscheidungen 2026-11-01 an IDA-311, 2026-11-04 an IDA-316):
 * - Am Telefon buchen (ein-, ausbuchen, aussondern, unbekannte Ware vorläufig anlegen): wer einen gültigen
 *   Helfer-Link geöffnet hat, ohne Anmeldung — oder wer angemeldet Zugang hat. Deshalb `requiresAuth: false`.
 * - Die Verwaltung (Bestand mit MHD-Stufen, Buchungen, Artikel): der Modulzugang (`verpflegung-nutzer`,
 *   `verpflegung-admin`).
 * - Lagerorte und Helfer-Links: Modul-Admins (`SUITE_ADMIN_GROUP_VERPFLEGUNG`, Vorgabe `verpflegung-admin`;
 *   der Suite-Admin zählt nach `isModuleAdmin` mit). Ein Link öffnet das Lager für jeden, der ihn hat.
 */
export interface Rechte {
  admin: boolean;
}

export function hatVerpflegungZugang(groups: readonly string[] | null | undefined, env: EnvLike = process.env): boolean {
  const mod = getModule("verpflegung");
  return hasAnyGroup(groups, requiredGroupsFor(mod, env)) || isModuleAdmin(mod, groups ? [...groups] : null, env);
}

export function istVerpflegungAdmin(groups: readonly string[] | null | undefined, env: EnvLike = process.env): boolean {
  return isModuleAdmin(getModule("verpflegung"), groups ? [...groups] : null, env);
}

/** Der Name, der an der Buchung steht: Anzeigename aus Pocket ID, sonst die Mailadresse. */
export function anzeigename(viewer: Viewer): string {
  return (viewer.name ?? viewer.email ?? "").trim() || "Unbekannt";
}

/** Wohin nach der Anmeldung: absolut auf den Modul-Host (Vorbild `wartung/_lib/zugang.ts`, `loginZiel`). */
export function loginZiel(kopf: Headers, pfad: string): string {
  const angefragt = resolveHost(kopf);
  const host = prodHostsFor(getModule("verpflegung"))[0] ?? (istVerpflegungHost(kopf) ? angefragt.split(":")[0] : undefined);
  if (!host) return `/m/verpflegung${pfad === "/" ? "" : pfad}`;
  const proto = kopf.get("x-forwarded-proto")?.split(",")[0].trim() || "http";
  const port = angefragt.split(":")[1];
  return `${proto}://${host}${port ? `:${port}` : ""}${pfad}`;
}

export const loginPfad = (kopf: Headers, pfad: string): string => `/login?callbackUrl=${encodeURIComponent(loginZiel(kopf, pfad))}`;

/**
 * Riegel für Layout UND jede Seite der Verwaltung: Host, Sitzung, Zugangsgruppe. Ohne Sitzung → Login und
 * zurück nach `pfad`; ohne Zugang → 404 mit Audit-Zeile.
 */
export async function requireZugang(pfad = "/"): Promise<{ viewer: Viewer; rechte: Rechte }> {
  const kopf = await headers();
  if (!istVerpflegungHost(kopf)) notFound();
  const viewer = (await auth())?.user;
  if (!viewer) {
    redirect(loginPfad(kopf, pfad));
  }
  if (!hatVerpflegungZugang(viewer.groups)) {
    auditDenied("verpflegung", auditActor(viewer));
    notFound();
  }
  return { viewer, rechte: { admin: istVerpflegungAdmin(viewer.groups) } };
}

export async function requireAdmin(pfad = "/"): Promise<{ viewer: Viewer; rechte: Rechte }> {
  const z = await requireZugang(pfad);
  if (!z.rechte.admin) {
    auditDenied("verpflegung", auditActor(z.viewer));
    notFound();
  }
  return z;
}

export type Stufe = "zugang" | "admin";

/** Riegel für Server Actions der Verwaltung: Host, Sitzung, Modulzugang, Stufe. Wurf statt Umleitung. */
export async function requireAktion(stufe: Stufe): Promise<{ viewer: Viewer; rechte: Rechte }> {
  const kopf = await headers();
  const viewer = (await auth())?.user;
  if (!istVerpflegungHost(kopf)) { auditDenied("verpflegung", auditActor(viewer)); throw new Error("Forbidden"); }
  if (!viewer) { throw new Error("Forbidden"); }
  if (!hatVerpflegungZugang(viewer.groups)) { auditDenied("verpflegung", auditActor(viewer)); throw new Error("Forbidden"); }
  const rechte = { admin: istVerpflegungAdmin(viewer.groups) };
  if (stufe === "admin" && !rechte.admin) { auditDenied("verpflegung", auditActor(viewer)); throw new Error("Forbidden"); }
  return { viewer, rechte };
}

/** Wer am Telefon bucht: eine angemeldete Person mit Zugang oder ein gültiger Helfer-Link. */
export type TelefonZugang =
  | { art: "konto"; viewer: Viewer; wer: string; linkId: null; laeuftAb: null }
  | { art: "link"; wer: string; linkId: string; laeuftAb: Date };

/**
 * Für die Telefonseiten: Host-Riegel (404), dann erst das Cookie des Helfer-Links, dann das Konto. Die
 * Reihenfolge ist Absicht: wer einen Link geöffnet hat, bucht unter dessen Namen, auch wenn er nebenbei
 * angemeldet ist (Vorbild Lagerbuch). `null` heißt: weder noch — die Seite zeigt den Weg hinein.
 */
export async function telefonZugang(): Promise<TelefonZugang | null> {
  if (!istVerpflegungHost(await headers())) notFound();
  return telefonZugangOhneHost();
}

async function telefonZugangOhneHost(): Promise<TelefonZugang | null> {
  const link = await linkAusCookie(getDb(), (await cookies()).get(HELFER_COOKIE)?.value, Date.now());
  if (link) return { art: "link", wer: `Zugangscode · ${link.name}`, linkId: link.id, laeuftAb: link.laeuftAb };
  const viewer = (await auth())?.user;
  if (viewer && hatVerpflegungZugang(viewer.groups)) return { art: "konto", viewer, wer: anzeigename(viewer), linkId: null, laeuftAb: null };
  return null;
}

/** Riegel für die Telefon-Actions: Host und Zugang, sonst Wurf mit Audit-Zeile. */
export async function requireTelefonAktion(): Promise<TelefonZugang> {
  const kopf = await headers();
  if (!istVerpflegungHost(kopf)) { auditDenied("verpflegung"); throw new Error("Forbidden"); }
  const z = await telefonZugangOhneHost();
  if (!z) { auditDenied("verpflegung"); throw new Error("Forbidden"); }
  return z;
}

/** Wer im Audit-Log steht: die Person, oder beim Helfer-Link der Link (kein Name aus der Eingabe). */
export function telefonAuditActor(z: TelefonZugang) {
  return z.art === "konto" ? auditActor(z.viewer) : auditAccessActor("verpflegung", z.linkId);
}
