"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { auth } from "@/core/auth";
import { getDb } from "./_db/client";
import {
  memberGroupIdsFor,
  getGroup,
  getEvening,
  getSurvey,
  getSurveyByEvening,
  insertGroup,
  updateGroup,
  setGroupSecret,
  deleteGroup,
  insertEvening,
  updateEvening,
  deleteEvening,
  insertSurvey,
  setSurveyStatus,
  activateSurvey,
  activeSurveyForGroup,
  insertResponse,
} from "./_db/queries";
import { assertGroupAccess } from "./_lib/access";
import { viewerFromSession } from "./_lib/viewer";
import { generateSecret } from "./_lib/token";
import { STANDARD_QUESTIONS } from "./_lib/questions";
import {
  computeClosesAt,
  nextStatusOnAccess,
  DEFAULT_CLOSE_AFTER_HOURS,
  type SurveyStatus,
} from "./_lib/lifecycle";
import { RateLimiter } from "./_lib/ratelimit";

const submitLimiter = new RateLimiter({ windowMs: 60_000, max: 10 });

function revalidate(): void {
  revalidatePath("/m/feedback");
  revalidatePath("/m/feedback/admin");
}

/** Guard-Helfer: aktueller Viewer + seine Gruppen-IDs, wirft Forbidden ohne Zugang. */
async function guardGroup(groupId: number) {
  const viewer = viewerFromSession(await auth());
  const db = getDb();
  const memberIds = viewer ? memberGroupIdsFor(db, viewer.sub) : [];
  assertGroupAccess(viewer, groupId, memberIds);
  return { viewer, db };
}

async function groupIdOfEvening(eveningId: number): Promise<number> {
  const eve = getEvening(getDb(), eveningId);
  if (!eve) throw new Error("Not found");
  return eve.groupId;
}
async function groupIdOfSurvey(surveyId: number): Promise<number> {
  const s = getSurvey(getDb(), surveyId);
  if (!s) throw new Error("Not found");
  return groupIdOfEvening(s.eveningId);
}

// ---- Gruppen ----
export async function createGroupAction(formData: FormData) {
  const viewer = viewerFromSession(await auth());
  // Nur Voll-Admin darf Gruppen anlegen (groupleader verwaltet bestehende).
  if (!viewer || !(await import("./_lib/access")).isFeedbackAdmin(viewer)) {
    throw new Error("Forbidden");
  }
  const db = getDb();
  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim();
  if (!name || !slug) throw new Error("Name und Slug erforderlich");
  const closeAfterHours = parseHours(formData.get("closeAfterHours"));
  insertGroup(db, { name, slug, secret: generateSecret(), closeAfterHours, createdAt: new Date() });
  revalidate();
}
export async function updateGroupAction(formData: FormData) {
  const id = num(formData.get("id"));
  const { db } = await guardGroup(id);
  updateGroup(db, id, {
    name: String(formData.get("name") ?? "").trim(),
    slug: String(formData.get("slug") ?? "").trim(),
    closeAfterHours: parseHours(formData.get("closeAfterHours")),
  });
  revalidate();
}
export async function regenerateSecretAction(formData: FormData) {
  const id = num(formData.get("id"));
  const { db } = await guardGroup(id);
  setGroupSecret(db, id, generateSecret());
  revalidate();
}
export async function deleteGroupAction(formData: FormData) {
  const id = num(formData.get("id"));
  const { db } = await guardGroup(id);
  deleteGroup(db, id);
  revalidate();
}

// ---- Dienstabende ----
export async function createEveningAction(formData: FormData) {
  const groupId = num(formData.get("groupId"));
  const { db } = await guardGroup(groupId);
  insertEvening(db, {
    groupId,
    date: parseDate(formData.get("date")),
    topic: strOrNull(formData.get("topic")),
    notes: strOrNull(formData.get("notes")),
    participantCount: parseCount(formData.get("participantCount")),
    createdAt: new Date(),
  });
  revalidate();
}
export async function updateEveningAction(formData: FormData) {
  const id = num(formData.get("id"));
  const { db } = await guardGroup(await groupIdOfEvening(id));
  updateEvening(db, id, {
    date: parseDate(formData.get("date")),
    topic: strOrNull(formData.get("topic")),
    notes: strOrNull(formData.get("notes")),
    participantCount: parseCount(formData.get("participantCount")),
  });
  revalidate();
}
export async function deleteEveningAction(formData: FormData) {
  const id = num(formData.get("id"));
  const { db } = await guardGroup(await groupIdOfEvening(id));
  deleteEvening(db, id);
  revalidate();
}

// ---- Umfragen ----
export async function createSurveyAction(formData: FormData) {
  const eveningId = num(formData.get("eveningId"));
  const { db } = await guardGroup(await groupIdOfEvening(eveningId));
  if (getSurveyByEvening(db, eveningId)) throw new Error("Umfrage existiert bereits");
  insertSurvey(db, {
    eveningId,
    questions: JSON.stringify(STANDARD_QUESTIONS),
    closeAfterHours: parseHours(formData.get("closeAfterHours")),
    createdAt: new Date(),
  });
  revalidate();
}
export async function activateSurveyAction(formData: FormData) {
  const id = num(formData.get("id"));
  const { db } = await guardGroup(await groupIdOfSurvey(id));
  const survey = getSurvey(db, id)!;
  const eve = getEvening(db, survey.eveningId)!;
  const group = getGroup(db, eve.groupId)!;
  const hours = survey.closeAfterHours ?? group.closeAfterHours ?? DEFAULT_CLOSE_AFTER_HOURS;
  const now = new Date();
  activateSurvey(db, id, computeClosesAt(now, hours), now);
  revalidate();
}
export async function closeSurveyAction(formData: FormData) {
  const id = num(formData.get("id"));
  const { db } = await guardGroup(await groupIdOfSurvey(id));
  setSurveyStatus(db, id, "closed", { closedAt: new Date() });
  revalidate();
}
export async function archiveSurveyAction(formData: FormData) {
  const id = num(formData.get("id"));
  const { db } = await guardGroup(await groupIdOfSurvey(id));
  setSurveyStatus(db, id, "archived");
  revalidate();
}

/**
 * Client-IP aus den Request-Headern (hinter Cloudflare zuverlässig via
 * cf-connecting-ip, sonst x-forwarded-for). Für Rate-Limiting statt Slug
 * oder Token: Keyen auf den Token würde jeden Secret-Guess in einen frischen
 * Bucket legen (kein Brute-Force-Schutz), Keyen auf den Slug würde alle
 * Teilnehmer eines Dienstabends — die denselben QR-Link scannen — gemeinsam
 * limitieren. Die IP bremst einen Brute-Forcer (eine IP), ohne echte
 * Teilnehmer mit verschiedenen Mobilfunk-IPs zu behindern.
 */
async function clientIp(): Promise<string> {
  const h = await headers();
  const cfIp = h.get("cf-connecting-ip");
  if (cfIp) return cfIp;
  const forwardedFor = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || "unknown";
}

// ---- Öffentliche Teilnahme ----
export async function submitResponseAction(slugSecret: string, formData: FormData) {
  const db = getDb();
  const { parseToken } = await import("./_lib/token");
  const { getGroupBySlug } = await import("./_db/queries");
  const parsed = parseToken(slugSecret);
  if (!parsed) throw new Error("Ungültiger Link");
  if (!submitLimiter.check(await clientIp())) throw new Error("Zu viele Anfragen — bitte später erneut.");
  const group = getGroupBySlug(db, parsed.slug);
  if (!group || group.secret !== parsed.secret) throw new Error("Ungültiger Link");

  const active = activeSurveyForGroup(db, group.id);
  if (!active) throw new Error("Keine aktive Umfrage");
  const survey = active.survey;
  // closes_at auch auf dem Submit-Pfad prüfen (nicht nur beim Anzeigen).
  const now = new Date();
  if (nextStatusOnAccess("active", survey.closesAt, now) !== "active") {
    setSurveyStatus(db, survey.id, "closed", { closedAt: now });
    throw new Error("Umfrage bereits geschlossen");
  }

  const questions: { id: string; type: string }[] = JSON.parse(survey.questions);
  const answers: Record<string, unknown> = {};
  for (const q of questions) {
    const raw = formData.get(q.id);
    if (raw === null || String(raw).trim() === "") continue;
    answers[q.id] = q.type === "text" ? String(raw) : Number(raw);
  }
  insertResponse(db, survey.id, answers, now);

  // Mehrfach-Absende-Schutz per Cookie (24h) — 1:1 zur Alt-App (public.go:105-112).
  (await cookies()).set(`feedback-${survey.id}`, "submitted", {
    maxAge: 86400,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
}

// ---- Parser-Helfer ----
function num(v: FormDataEntryValue | null): number {
  const n = Number(v);
  if (!Number.isInteger(n)) throw new Error("Ungültige ID");
  return n;
}
function parseHours(v: FormDataEntryValue | null): number | null {
  if (v === null || String(v).trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}
function parseCount(v: FormDataEntryValue | null): number | null {
  if (v === null || String(v).trim() === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : null;
}
function parseDate(v: FormDataEntryValue | null): Date {
  const s = String(v ?? "");
  const d = new Date(`${s}T00:00:00Z`); // YYYY-MM-DD → Mitternacht UTC
  if (Number.isNaN(d.getTime())) throw new Error("Ungültiges Datum");
  return d;
}
function strOrNull(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}
