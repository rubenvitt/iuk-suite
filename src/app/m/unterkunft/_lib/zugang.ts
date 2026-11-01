import { redirect } from "next/navigation";
import { auth } from "@/core/auth";

/**
 * Jeder Angemeldete darf rechnen: das Modul liest und schreibt keine Daten (`registry.ts`, Eintrag
 * `unterkunft`). Die Middleware riegelt schon über `requiresAuth`; Layout und Seite fragen trotzdem selbst,
 * eine Route Group ist keine Sicherheitsgrenze.
 */
export async function requireUnterkunftSitzung(): Promise<void> {
  const sitzung = await auth();
  if (!sitzung?.user) redirect(`/login?callbackUrl=${encodeURIComponent("/m/unterkunft")}`);
}
