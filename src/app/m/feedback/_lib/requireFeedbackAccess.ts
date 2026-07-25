import { redirect, notFound } from "next/navigation";
import { auth } from "@/core/auth";
import { getModule } from "@/core/registry";
import { getDb } from "../_db/client";
import { upsertKnownUser } from "../_db/queries";
import { viewerFromSession } from "./viewer";
import { isFeedbackAdmin, type Viewer } from "./access";

/**
 * DER AUTH-BACKSTOP DES MODULS — EINE Stelle, zwei Layouts (Entwurf §3.5).
 *
 * Warum es ihn überhaupt gibt: `feedback` ist `requiresAuth: false`. Das ist
 * PFLICHT für die anonyme Teilnahme unter `/f/`, hat aber die Folge, dass
 * `core/routing.ts` + `proxy.ts` (die Middleware) die VERWALTUNG nicht gaten.
 * Ohne diesen Riegel wäre jede Seite allein auf sich gestellt.
 *
 * Warum er hier liegt und nicht (mehr) im `(admin)`-Layout: die Druckansicht des
 * Aushangs (§3.5) braucht ein eigenes Layout OHNE `Shell` — sonst druckt FullShell
 * Header und AppSwitcher mit. Damit fiel sie aus dem Schutz des `(admin)`-Layouts
 * heraus, und sie zeigt das SECRET der Gruppe, also den dauerhaften Zugang zu
 * jeder künftigen Umfrage. Beide Layouts rufen deshalb DIESE Funktion; die Seiten
 * prüfen zusätzlich `guardPage(groupId)` gegen die geladene Gruppen-Id (zweite
 * Linie, gegen IDOR).
 *
 * Verhalten unverändert gegenüber dem vorherigen Inline-Riegel: keine Session →
 * Login-Redirect mit `callbackUrl`; Session ohne Zugang → 404 (verrät nicht, dass
 * es die Route gibt — konsistent mit den Seiten-Guards). Der Verzeichnis-Eintrag
 * läuft NACH dem Riegel: nur wer die Prüfung übersteht, wird zuordenbar
 * (idempotent auf `userId`).
 */
export async function requireFeedbackAccess(): Promise<Viewer> {
  const mod = getModule("feedback");
  const session = await auth();
  const viewer = viewerFromSession(session);
  if (!viewer) redirect(`/login?callbackUrl=${encodeURIComponent("/m/feedback")}`);

  const hasAccess =
    isFeedbackAdmin(viewer) || viewer.groups.some((g) => mod.requiredGroups.includes(g));
  if (!hasAccess) notFound();

  upsertKnownUser(getDb(), {
    userId: viewer.sub,
    name: session?.user?.name ?? null,
    email: session?.user?.email ?? null,
    seenAt: new Date(),
  });

  return viewer;
}
