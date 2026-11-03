import { auditActor, auditDenied, auditLoginRequired } from "@/core/audit/server";
import { auth } from "@/core/auth";
import { notFound, redirect } from "next/navigation";
import { viewerFromSession } from "../viewer";
import type { Viewer } from "../access";

type EnvLike = Record<string, string | undefined>;

/**
 * WER DEN KASTEN LIEST (Entscheidung 2026-11-01 an IDA-309): genau die Mitglieder EINER Pocket-ID-Gruppe,
 * der Vertrauenspersonen. Nicht `feedback-admin`, nicht der Suite-Betrieb — wer Dienstabende auswertet oder
 * den Server betreibt, hat damit noch keinen Anlass, Mitteilungen an Vertrauenspersonen zu lesen.
 *
 * Vorgabe `kummerkasten-leser` (IDA-314: der technische Name bleibt, auf dem Bildschirm heißt es „Ehrlich
 * gesagt"), überschreibbar mit `SUITE_LESER_GROUP_FEEDBACK` — EIN getrimmter Name, kein Komma-Split.
 */
export const LESER_GRUPPE_VORGABE = "kummerkasten-leser";

export function leserGruppe(env: EnvLike = process.env): string {
  return env.SUITE_LESER_GROUP_FEEDBACK?.trim() || LESER_GRUPPE_VORGABE;
}

export function istEhrlichLeser(groups: readonly string[] | null | undefined, env: EnvLike = process.env): boolean {
  return (groups ?? []).includes(leserGruppe(env));
}

export type EhrlichLeser = Viewer & { name: string };

/**
 * Der Riegel jeder Seite und jeder Aktion der Verwaltung. Ohne Sitzung zum Login, ohne Gruppe 404 (verrät die
 * Route nicht) — dieselbe Lesart wie `requireFeedbackAccess`. Die Gruppe kommt aus dem JWT, also mit dem
 * üblichen Verzug bis zur nächsten Auffrischung (CLAUDE.md, „Zugriffsschutz").
 */
export async function requireEhrlichLeser(callbackPfad = "/m/feedback/ehrlich-gesagt"): Promise<EhrlichLeser> {
  const session = await auth();
  const viewer = viewerFromSession(session);
  if (!viewer) {
    auditLoginRequired("feedback");
    redirect(`/login?callbackUrl=${encodeURIComponent(callbackPfad)}`);
  }
  if (!istEhrlichLeser(viewer.groups)) {
    auditDenied("feedback", auditActor(viewer));
    notFound();
  }
  const name = session?.user?.name?.trim() || session?.user?.email?.trim() || "Vertrauensperson";
  return { ...viewer, name };
}
