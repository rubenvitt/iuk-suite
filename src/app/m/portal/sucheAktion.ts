"use server";
import { auth } from "@/core/auth";
import { suchbegriff } from "@/core/suche";
import { sucheUeberall, type ModulErgebnis } from "@/app/m/portal/_lib/suche";

/**
 * Die suiteweite Suche für das Suchfeld der Startseite (IDA-301): dieselbe Abfrage wie `/suche`,
 * nur als Server Action, damit die Treffer beim Tippen unter den Apps erscheinen.
 *
 * Die Sitzung liest die Action SELBST (`auth()`), nie aus einem Argument: sonst könnte ein
 * Aufrufer sich fremde Gruppen hineinreichen. Die Rechte prüft danach jedes Modul (`suiteSuche`).
 */
export async function sucheAktion(roh: string): Promise<ModulErgebnis[]> {
  const begriff = suchbegriff(typeof roh === "string" ? roh : undefined);
  if (!begriff) return [];
  const sitzung = await auth();
  if (!sitzung?.user) return [];
  return sucheUeberall(begriff, sitzung);
}
